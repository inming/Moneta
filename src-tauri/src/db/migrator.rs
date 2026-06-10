use include_dir::{include_dir, Dir};
use rusqlite::Connection;

/// 编译期内嵌全部迁移 SQL（与旧 Electron 版同一组文件，逐字相同）
static MIGRATIONS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

/// 复刻旧 migrator.ts 的语义：_migrations 表跟踪、按文件名排序、
/// 每个文件取 `-- up` 段、单事务执行。对旧库幂等。
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name  TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )",
    )
    .map_err(|e| e.to_string())?;

    let mut files: Vec<_> = MIGRATIONS_DIR
        .files()
        .filter(|f| f.path().extension().is_some_and(|e| e == "sql"))
        .collect();
    files.sort_by_key(|f| f.path().to_path_buf());

    let applied: std::collections::HashSet<String> = {
        let mut stmt = conn.prepare("SELECT name FROM _migrations").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    for file in files {
        let name = file
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if applied.contains(&name) {
            continue;
        }
        let content = file.contents_utf8().ok_or(format!("{name} 不是 UTF-8"))?;
        let up_sql = extract_up_section(content);
        if up_sql.trim().is_empty() {
            continue;
        }

        log::info!("[Migration] Executing {name}");
        conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        let result = conn
            .execute_batch(up_sql.trim())
            .and_then(|_| {
                conn.execute("INSERT INTO _migrations (name) VALUES (?1)", [&name])
                    .map(|_| ())
            });
        match result {
            Ok(()) => conn.execute_batch("COMMIT").map_err(|e| e.to_string())?,
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(format!("{name}: {e}"));
            }
        }
    }
    Ok(())
}

/// 当前 schema 版本 = _migrations 表最大 id（与旧 getCurrentSchemaVersion 一致）
pub fn current_schema_version(conn: &Connection) -> i64 {
    conn.query_row("SELECT MAX(id) FROM _migrations", [], |r| r.get::<_, Option<i64>>(0))
        .ok()
        .flatten()
        .unwrap_or(0)
}

fn extract_up_section(sql: &str) -> &str {
    let Some(up_index) = sql.find("-- up") else {
        return sql;
    };
    let start = up_index + "-- up".len();
    let end = sql.find("-- down").unwrap_or(sql.len());
    &sql[start..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let conn = crate::db::open_connection(&dir.path().join("m.db"), &"cd".repeat(32)).unwrap();
        run_migrations(&conn).unwrap();

        // 关键表都建出来了
        for table in ["categories", "operators", "transactions", "import_draft"] {
            let n: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "missing table {table}");
        }
        // 系统预置分类已种子
        let cats: i64 = conn
            .query_row("SELECT count(*) FROM categories WHERE is_system = 1", [], |r| r.get(0))
            .unwrap();
        assert!(cats > 0);

        // 幂等
        run_migrations(&conn).unwrap();
        let applied: i64 = conn
            .query_row("SELECT count(*) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(applied, 10);
    }
}

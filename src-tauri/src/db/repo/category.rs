use rusqlite::{Connection, Row};

use crate::error::{AppError, AppResult};
use crate::models::{Category, CreateCategoryDTO, DeleteCategoryResult, UpdateCategoryDTO};

fn map_err(e: rusqlite::Error) -> AppError {
    if e.to_string().contains("UNIQUE constraint") {
        AppError::msg("该分类名称已存在")
    } else {
        AppError::Db(e.to_string())
    }
}

fn cat_from_row(row: &Row) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get("id")?,
        name: row.get("name")?,
        cat_type: row.get("type")?,
        icon: row.get("icon")?,
        description: row.get("description")?,
        sort_order: row.get("sort_order")?,
        is_system: row.get::<_, i64>("is_system")? != 0,
        is_active: row.get::<_, i64>("is_active")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn find_all(conn: &Connection, cat_type: Option<&str>) -> AppResult<Vec<Category>> {
    let (sql, params): (&str, Vec<String>) = match cat_type {
        Some(t) => (
            "SELECT * FROM categories WHERE is_active = 1 AND type = ?1 ORDER BY sort_order",
            vec![t.to_string()],
        ),
        None => ("SELECT * FROM categories WHERE is_active = 1 ORDER BY type, sort_order", vec![]),
    };
    let mut stmt = conn.prepare(sql).map_err(map_err)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), cat_from_row)
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;
    Ok(rows)
}

pub fn find_all_include_inactive(conn: &Connection, cat_type: Option<&str>) -> AppResult<Vec<Category>> {
    let (sql, params): (&str, Vec<String>) = match cat_type {
        Some(t) => ("SELECT * FROM categories WHERE type = ?1 ORDER BY sort_order", vec![t.to_string()]),
        None => ("SELECT * FROM categories ORDER BY type, sort_order", vec![]),
    };
    let mut stmt = conn.prepare(sql).map_err(map_err)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), cat_from_row)
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;
    Ok(rows)
}

pub fn find_by_name_and_type(
    conn: &Connection,
    name: &str,
    cat_type: &str,
) -> AppResult<Option<Category>> {
    match conn.query_row(
        "SELECT * FROM categories WHERE name = ?1 AND type = ?2",
        [name, cat_type],
        cat_from_row,
    ) {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(map_err(e)),
    }
}

pub fn find_by_id(conn: &Connection, id: i64) -> AppResult<Category> {
    conn.query_row("SELECT * FROM categories WHERE id = ?1", [id], cat_from_row)
        .map_err(map_err)
}

pub fn create(conn: &Connection, dto: &CreateCategoryDTO) -> AppResult<Category> {
    conn.execute(
        "INSERT INTO categories (name, type, icon, description, sort_order, is_system)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        rusqlite::params![
            dto.name,
            dto.cat_type,
            dto.icon,
            dto.description.clone().unwrap_or_default(),
            dto.sort_order.unwrap_or(0),
        ],
    )
    .map_err(map_err)?;
    find_by_id(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, dto: &UpdateCategoryDTO) -> AppResult<Category> {
    use rusqlite::types::Value;
    let mut sets: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(v) = &dto.name {
        sets.push("name = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = &dto.icon {
        sets.push("icon = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = &dto.description {
        sets.push("description = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = dto.is_active {
        sets.push("is_active = ?".into());
        values.push(Value::Integer(i64::from(v)));
    }
    if let Some(v) = dto.sort_order {
        sets.push("sort_order = ?".into());
        values.push(Value::Integer(v));
    }

    if sets.is_empty() {
        return find_by_id(conn, id);
    }

    sets.push("updated_at = datetime('now', 'localtime')".into());
    values.push(Value::Integer(id));

    conn.execute(
        &format!("UPDATE categories SET {} WHERE id = ?", sets.join(", ")),
        rusqlite::params_from_iter(values.iter()),
    )
    .map_err(map_err)?;
    find_by_id(conn, id)
}

/// 有关联交易 → 软删除（停用）；否则物理删除
pub fn remove(conn: &Connection, id: i64) -> AppResult<DeleteCategoryResult> {
    let cnt: i64 = conn
        .query_row("SELECT COUNT(*) FROM transactions WHERE category_id = ?1", [id], |r| r.get(0))
        .map_err(map_err)?;

    if cnt > 0 {
        conn.execute(
            "UPDATE categories SET is_active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?1",
            [id],
        )
        .map_err(map_err)?;
        return Ok(DeleteCategoryResult { soft_deleted: true });
    }
    conn.execute("DELETE FROM categories WHERE id = ?1", [id]).map_err(map_err)?;
    Ok(DeleteCategoryResult { soft_deleted: false })
}

pub fn delete_all_custom(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM categories WHERE is_system = 0", []).map_err(map_err)?;
    Ok(())
}

pub fn reset_system_categories(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "UPDATE categories SET is_active = 1, updated_at = datetime('now', 'localtime') WHERE is_system = 1",
        [],
    )
    .map_err(map_err)?;
    Ok(())
}

pub fn reorder(conn: &Connection, cat_type: &str, ids: &[i64]) -> AppResult<()> {
    conn.execute_batch("BEGIN").map_err(map_err)?;
    let result = (|| -> AppResult<()> {
        let mut stmt = conn
            .prepare(
                "UPDATE categories SET sort_order = ?1, updated_at = datetime('now', 'localtime')
                 WHERE id = ?2 AND type = ?3",
            )
            .map_err(map_err)?;
        for (i, id) in ids.iter().enumerate() {
            stmt.execute(rusqlite::params![(i + 1) as i64, id, cat_type]).map_err(map_err)?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => conn.execute_batch("COMMIT").map_err(map_err),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    #[test]
    fn create_unique_and_soft_delete() {
        let (_dir, conn) = fresh_test_db();
        let c = create(
            &conn,
            &CreateCategoryDTO {
                name: "测试分类".into(),
                cat_type: "expense".into(),
                icon: None,
                description: None,
                sort_order: Some(99),
            },
        )
        .unwrap();
        assert!(!c.is_system);

        // 同名同类型唯一约束 → 中文错误信息
        let dup = create(
            &conn,
            &CreateCategoryDTO {
                name: "测试分类".into(),
                cat_type: "expense".into(),
                icon: None,
                description: None,
                sort_order: None,
            },
        );
        assert!(dup.unwrap_err().to_string().contains("已存在"));

        // 无关联交易 → 物理删除
        let r = remove(&conn, c.id).unwrap();
        assert!(!r.soft_deleted);

        // 有关联交易 → 软删除
        let c2 = create(
            &conn,
            &CreateCategoryDTO {
                name: "软删".into(),
                cat_type: "expense".into(),
                icon: None,
                description: None,
                sort_order: None,
            },
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transactions (date, type, amount, category_id, description) VALUES ('2025-01-01','expense',1,?1,'')",
            [c2.id],
        )
        .unwrap();
        let r2 = remove(&conn, c2.id).unwrap();
        assert!(r2.soft_deleted);
        assert!(!find_all_include_inactive(&conn, Some("expense")).unwrap()
            .iter().find(|c| c.id == c2.id).unwrap().is_active);
    }

    #[test]
    fn reorder_updates_sort_order() {
        let (_dir, conn) = fresh_test_db();
        let cats = find_all(&conn, Some("expense")).unwrap();
        assert!(cats.len() >= 2);
        let mut ids: Vec<i64> = cats.iter().map(|c| c.id).collect();
        ids.reverse();
        reorder(&conn, "expense", &ids).unwrap();
        let after = find_all(&conn, Some("expense")).unwrap();
        assert_eq!(after[0].id, ids[0]);
    }
}

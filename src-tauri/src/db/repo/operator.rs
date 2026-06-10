use rusqlite::{Connection, Row};

use crate::error::{AppError, AppResult};
use crate::models::Operator;

fn map_err(e: rusqlite::Error) -> AppError {
    AppError::Db(e.to_string())
}

fn op_from_row(row: &Row) -> rusqlite::Result<Operator> {
    Ok(Operator {
        id: row.get("id")?,
        name: row.get("name")?,
        is_default: row.get::<_, i64>("is_default")? != 0,
        created_at: row.get("created_at")?,
    })
}

pub fn find_all(conn: &Connection) -> AppResult<Vec<Operator>> {
    let mut stmt = conn.prepare("SELECT * FROM operators ORDER BY id").map_err(map_err)?;
    let rows = stmt
        .query_map([], op_from_row)
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;
    Ok(rows)
}

#[cfg(test)]
pub fn find_by_name(conn: &Connection, name: &str) -> AppResult<Option<Operator>> {
    match conn.query_row("SELECT * FROM operators WHERE name = ?1", [name], op_from_row) {
        Ok(o) => Ok(Some(o)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(map_err(e)),
    }
}

pub fn find_by_id(conn: &Connection, id: i64) -> AppResult<Operator> {
    conn.query_row("SELECT * FROM operators WHERE id = ?1", [id], op_from_row).map_err(map_err)
}

pub fn create(conn: &Connection, name: &str) -> AppResult<Operator> {
    conn.execute("INSERT INTO operators (name) VALUES (?1)", [name]).map_err(map_err)?;
    find_by_id(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, name: &str) -> AppResult<Operator> {
    conn.execute("UPDATE operators SET name = ?1 WHERE id = ?2", rusqlite::params![name, id])
        .map_err(map_err)?;
    find_by_id(conn, id)
}

pub fn remove(conn: &Connection, id: i64) -> AppResult<()> {
    let cnt: i64 = conn
        .query_row("SELECT COUNT(*) FROM transactions WHERE operator_id = ?1", [id], |r| r.get(0))
        .map_err(map_err)?;
    if cnt > 0 {
        return Err(AppError::msg("该操作人已关联交易记录，无法删除"));
    }
    conn.execute("DELETE FROM operators WHERE id = ?1", [id]).map_err(map_err)?;
    Ok(())
}

pub fn delete_all(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM operators", []).map_err(map_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    #[test]
    fn crud_and_delete_guard() {
        let (_dir, conn) = fresh_test_db();
        let o = create(&conn, "小明").unwrap();
        assert!(!o.is_default);
        assert_eq!(find_by_name(&conn, "小明").unwrap().unwrap().id, o.id);

        update(&conn, o.id, "小红").unwrap();
        assert!(find_by_name(&conn, "小明").unwrap().is_none());

        // 关联交易后禁止删除
        conn.execute(
            "INSERT INTO transactions (date, type, amount, category_id, description, operator_id)
             VALUES ('2025-01-01','expense',1,1,'',?1)",
            [o.id],
        )
        .unwrap();
        let err = remove(&conn, o.id).unwrap_err();
        assert!(err.to_string().contains("无法删除"));
    }
}

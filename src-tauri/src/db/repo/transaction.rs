use rusqlite::types::Value;
use rusqlite::{params_from_iter, Connection, Row};

use crate::error::{AppError, AppResult};
use crate::models::{
    CreateTransactionDTO, ExportRow, PaginatedResult, Transaction, TransactionListParams,
    UpdateTransactionDTO,
};

fn map_err(e: rusqlite::Error) -> AppError {
    AppError::Db(e.to_string())
}

fn tx_from_row(row: &Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get("id")?,
        date: row.get("date")?,
        tx_type: row.get("type")?,
        amount: row.get("amount")?,
        category_id: row.get("category_id")?,
        description: row.get("description")?,
        operator_id: row.get("operator_id")?,
        is_occasional: row.get::<_, i64>("is_occasional")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// 动态 WHERE：与旧 buildWhereClause 完全同语义
/// （数组条件优先于单值条件；keyword 为 LIKE 模糊匹配）
fn build_where(params: &TransactionListParams) -> (String, Vec<Value>) {
    let mut conditions: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(v) = &params.date_from {
        conditions.push("t.date >= ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = &params.date_to {
        conditions.push("t.date <= ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(types) = params.types.as_ref().filter(|v| !v.is_empty()) {
        let placeholders = vec!["?"; types.len()].join(",");
        conditions.push(format!("t.type IN ({placeholders})"));
        values.extend(types.iter().map(|t| Value::Text(t.clone())));
    } else if let Some(t) = &params.tx_type {
        conditions.push("t.type = ?".into());
        values.push(Value::Text(t.clone()));
    }
    if let Some(ids) = params.category_ids.as_ref().filter(|v| !v.is_empty()) {
        let placeholders = vec!["?"; ids.len()].join(",");
        conditions.push(format!("t.category_id IN ({placeholders})"));
        values.extend(ids.iter().map(|id| Value::Integer(*id)));
    } else if let Some(id) = params.category_id {
        conditions.push("t.category_id = ?".into());
        values.push(Value::Integer(id));
    }
    if let Some(ids) = params.operator_ids.as_ref().filter(|v| !v.is_empty()) {
        let placeholders = vec!["?"; ids.len()].join(",");
        conditions.push(format!("t.operator_id IN ({placeholders})"));
        values.extend(ids.iter().map(|id| Value::Integer(*id)));
    } else if let Some(id) = params.operator_id {
        conditions.push("t.operator_id = ?".into());
        values.push(Value::Integer(id));
    }
    if let Some(kw) = params.keyword.as_ref().filter(|k| !k.is_empty()) {
        conditions.push("t.description LIKE ?".into());
        values.push(Value::Text(format!("%{kw}%")));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    (where_clause, values)
}

pub fn find_all(
    conn: &Connection,
    params: &TransactionListParams,
) -> AppResult<PaginatedResult<Transaction>> {
    let page = params.page.unwrap_or(1);
    let page_size = params.page_size.unwrap_or(50);

    let (where_clause, values) = build_where(params);

    let sort_col = match params.sort_field.as_deref() {
        Some("amount") => "t.amount",
        Some("created_at") => "t.created_at",
        Some("date") => "t.date",
        _ => "t.date",
    };
    let sort_dir = if params.sort_order.as_deref() == Some("ascend") { "ASC" } else { "DESC" };
    let order_by = format!("ORDER BY {sort_col} {sort_dir}, t.id {sort_dir}");

    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM transactions t {where_clause}"),
            params_from_iter(values.iter()),
            |r| r.get(0),
        )
        .map_err(map_err)?;

    let mut query_values = values;
    query_values.push(Value::Integer(page_size));
    query_values.push(Value::Integer((page - 1) * page_size));

    let mut stmt = conn
        .prepare(&format!(
            "SELECT t.* FROM transactions t {where_clause} {order_by} LIMIT ? OFFSET ?"
        ))
        .map_err(map_err)?;
    let items = stmt
        .query_map(params_from_iter(query_values.iter()), tx_from_row)
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;

    Ok(PaginatedResult { items, total, page, page_size })
}

pub fn count_for_export(conn: &Connection, params: &TransactionListParams) -> AppResult<i64> {
    let (where_clause, values) = build_where(params);
    conn.query_row(
        &format!("SELECT COUNT(*) FROM transactions t {where_clause}"),
        params_from_iter(values.iter()),
        |r| r.get(0),
    )
    .map_err(map_err)
}

pub fn find_all_for_export(
    conn: &Connection,
    params: &TransactionListParams,
) -> AppResult<Vec<ExportRow>> {
    let (where_clause, values) = build_where(params);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT t.date, t.type, t.amount, c.name as category_name,
                    t.description, COALESCE(o.name, '') as operator_name,
                    t.created_at, t.is_occasional
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             LEFT JOIN operators o ON t.operator_id = o.id
             {where_clause}
             ORDER BY t.date ASC, t.id ASC"
        ))
        .map_err(map_err)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok(ExportRow {
                date: row.get("date")?,
                tx_type: row.get("type")?,
                amount: row.get("amount")?,
                category_name: row.get::<_, Option<String>>("category_name")?.unwrap_or_default(),
                description: row.get("description")?,
                operator_name: row.get("operator_name")?,
                created_at: row.get("created_at")?,
                is_occasional: row.get("is_occasional")?,
            })
        })
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;
    Ok(rows)
}

pub fn create(conn: &Connection, dto: &CreateTransactionDTO) -> AppResult<Transaction> {
    conn.execute(
        "INSERT INTO transactions (date, type, amount, category_id, description, operator_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            dto.date,
            dto.tx_type,
            dto.amount,
            dto.category_id,
            dto.description.clone().unwrap_or_default(),
            dto.operator_id,
        ],
    )
    .map_err(map_err)?;
    let id = conn.last_insert_rowid();
    find_by_id(conn, id)
}

pub fn find_by_id(conn: &Connection, id: i64) -> AppResult<Transaction> {
    conn.query_row("SELECT * FROM transactions WHERE id = ?1", [id], tx_from_row)
        .map_err(map_err)
}

pub fn batch_create(conn: &Connection, items: &[CreateTransactionDTO]) -> AppResult<()> {
    conn.execute_batch("BEGIN").map_err(map_err)?;
    let result = (|| -> AppResult<()> {
        let mut stmt_with_time = conn
            .prepare(
                "INSERT INTO transactions (date, type, amount, category_id, description, operator_id, created_at, is_occasional)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )
            .map_err(map_err)?;
        let mut stmt_default_time = conn
            .prepare(
                "INSERT INTO transactions (date, type, amount, category_id, description, operator_id, is_occasional)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(map_err)?;
        for item in items {
            let occasional = i64::from(item.is_occasional.unwrap_or(false));
            let description = item.description.clone().unwrap_or_default();
            if let Some(created_at) = &item.created_at {
                stmt_with_time
                    .execute(rusqlite::params![
                        item.date,
                        item.tx_type,
                        item.amount,
                        item.category_id,
                        description,
                        item.operator_id,
                        created_at,
                        occasional,
                    ])
                    .map_err(map_err)?;
            } else {
                stmt_default_time
                    .execute(rusqlite::params![
                        item.date,
                        item.tx_type,
                        item.amount,
                        item.category_id,
                        description,
                        item.operator_id,
                        occasional,
                    ])
                    .map_err(map_err)?;
            }
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

pub fn update(conn: &Connection, id: i64, dto: &UpdateTransactionDTO) -> AppResult<Transaction> {
    let mut sets: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(v) = &dto.date {
        sets.push("date = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = &dto.tx_type {
        sets.push("type = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = dto.amount {
        sets.push("amount = ?".into());
        values.push(Value::Real(v));
    }
    if let Some(v) = dto.category_id {
        sets.push("category_id = ?".into());
        values.push(Value::Integer(v));
    }
    if let Some(v) = &dto.description {
        sets.push("description = ?".into());
        values.push(Value::Text(v.clone()));
    }
    if let Some(v) = &dto.operator_id {
        sets.push("operator_id = ?".into());
        values.push(match v {
            Some(id) => Value::Integer(*id),
            None => Value::Null,
        });
    }
    if let Some(v) = dto.is_occasional {
        sets.push("is_occasional = ?".into());
        values.push(Value::Integer(i64::from(v)));
    }

    if sets.is_empty() {
        return find_by_id(conn, id);
    }

    sets.push("updated_at = datetime('now', 'localtime')".into());
    values.push(Value::Integer(id));

    conn.execute(
        &format!("UPDATE transactions SET {} WHERE id = ?", sets.join(", ")),
        params_from_iter(values.iter()),
    )
    .map_err(map_err)?;

    find_by_id(conn, id)
}

pub fn remove(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM transactions WHERE id = ?1", [id]).map_err(map_err)?;
    Ok(())
}

pub fn batch_delete(conn: &Connection, ids: &[i64]) -> AppResult<i64> {
    if ids.is_empty() {
        return Ok(0);
    }
    let placeholders = vec!["?"; ids.len()].join(",");
    let changed = conn
        .execute(
            &format!("DELETE FROM transactions WHERE id IN ({placeholders})"),
            params_from_iter(ids.iter()),
        )
        .map_err(map_err)?;
    Ok(changed as i64)
}

pub fn delete_all(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM transactions", []).map_err(map_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    fn dto(date: &str, tx_type: &str, amount: f64, category_id: i64) -> CreateTransactionDTO {
        CreateTransactionDTO {
            date: date.into(),
            tx_type: tx_type.into(),
            amount,
            category_id,
            description: Some(format!("test {date}")),
            operator_id: None,
            created_at: None,
            is_occasional: None,
        }
    }

    #[test]
    fn crud_and_pagination() {
        let (_dir, conn) = fresh_test_db();

        let t = create(&conn, &dto("2025-01-15", "expense", 100.5, 1)).unwrap();
        assert_eq!(t.amount, 100.5);
        assert!(!t.is_occasional);

        batch_create(
            &conn,
            &[dto("2025-02-01", "expense", 50.0, 1), dto("2025-03-01", "income", 800.0, 1)],
        )
        .unwrap();

        let all = find_all(&conn, &TransactionListParams::default()).unwrap();
        assert_eq!(all.total, 3);

        // 类型过滤 + 排序
        let expenses = find_all(
            &conn,
            &TransactionListParams {
                tx_type: Some("expense".into()),
                sort_field: Some("date".into()),
                sort_order: Some("ascend".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(expenses.total, 2);
        assert_eq!(expenses.items[0].date, "2025-01-15");

        // 更新：operator_id 显式 null vs 缺失
        let updated = update(
            &conn,
            t.id,
            &UpdateTransactionDTO {
                amount: Some(200.0),
                is_occasional: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.amount, 200.0);
        assert!(updated.is_occasional);

        // 关键字
        let kw = find_all(
            &conn,
            &TransactionListParams { keyword: Some("2025-02".into()), ..Default::default() },
        )
        .unwrap();
        assert_eq!(kw.total, 1);

        // 批量删除
        let removed = batch_delete(&conn, &[t.id]).unwrap();
        assert_eq!(removed, 1);
        assert_eq!(find_all(&conn, &TransactionListParams::default()).unwrap().total, 2);
    }

    #[test]
    fn export_rows_join_names() {
        let (_dir, conn) = fresh_test_db();
        create(&conn, &dto("2025-05-01", "expense", 10.0, 1)).unwrap();
        let rows = find_all_for_export(&conn, &TransactionListParams::default()).unwrap();
        assert_eq!(rows.len(), 1);
        assert!(!rows[0].category_name.is_empty());
        assert_eq!(rows[0].operator_name, "");
    }
}

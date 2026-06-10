use std::collections::HashMap;

use rusqlite::types::Value;
use rusqlite::{params_from_iter, Connection};

use crate::error::{AppError, AppResult};
use crate::models::{
    CrossTableData, CrossTableParams, CrossTableRow, CrossTableTotals, SummaryData, SummaryParams,
    YearRangeData, YearlyCategoryData, YearlyCategoryParams, YearlyCategoryRef, YearlyCategoryRow,
    YearlyCategoryTotals,
};

fn map_err(e: rusqlite::Error) -> AppError {
    AppError::Db(e.to_string())
}

pub fn get_cross_table(conn: &Connection, params: &CrossTableParams) -> AppResult<CrossTableData> {
    let mut sql = String::from(
        "SELECT t.category_id, c.name AS category_name,
                CAST(strftime('%m', t.date) AS INTEGER) AS month_num,
                SUM(t.amount) AS total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.date BETWEEN ? AND ?
           AND t.type = ?",
    );
    let mut values: Vec<Value> = vec![
        Value::Text(format!("{}-01-01", params.year)),
        Value::Text(format!("{}-12-31", params.year)),
        Value::Text(params.tx_type.clone()),
    ];
    if let Some(op) = params.operator_id {
        sql.push_str(" AND t.operator_id = ?");
        values.push(Value::Integer(op));
    }
    sql.push_str(" GROUP BY t.category_id, month_num ORDER BY c.sort_order ASC");

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let raw_rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>("category_id")?,
                row.get::<_, String>("category_name")?,
                row.get::<_, i64>("month_num")?,
                row.get::<_, f64>("total")?,
            ))
        })
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;

    // Pivot：按分类聚合（保持 SQL 返回顺序 = sort_order）
    let mut order: Vec<i64> = Vec::new();
    let mut rows_map: HashMap<i64, CrossTableRow> = HashMap::new();
    for (category_id, category_name, month_num, total) in raw_rows {
        let row = rows_map.entry(category_id).or_insert_with(|| {
            order.push(category_id);
            CrossTableRow { category_id, category_name, months: vec![0.0; 12], yearly: 0.0 }
        });
        if (1..=12).contains(&month_num) {
            row.months[(month_num - 1) as usize] = total;
        }
    }

    let mut rows: Vec<CrossTableRow> =
        order.into_iter().filter_map(|id| rows_map.remove(&id)).collect();

    let mut total_months = vec![0.0; 12];
    let mut total_yearly = 0.0;
    for row in rows.iter_mut() {
        row.yearly = row.months.iter().sum();
        for (total, v) in total_months.iter_mut().zip(&row.months) {
            *total += v;
        }
        total_yearly += row.yearly;
    }

    Ok(CrossTableData { rows, totals: CrossTableTotals { months: total_months, yearly: total_yearly } })
}

fn last_day_of_month(year: i32, month: u32) -> u32 {
    // 与 JS 的 new Date(year, month, 0).getDate() 一致
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

pub fn get_summary(conn: &Connection, params: &SummaryParams) -> AppResult<SummaryData> {
    let sum_amount = |date_from: String, date_to: String| -> AppResult<f64> {
        let mut sql = String::from(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE date BETWEEN ? AND ? AND type = ?",
        );
        let mut values: Vec<Value> = vec![
            Value::Text(date_from),
            Value::Text(date_to),
            Value::Text(params.tx_type.clone()),
        ];
        if let Some(op) = params.operator_id {
            sql.push_str(" AND operator_id = ?");
            values.push(Value::Integer(op));
        }
        conn.query_row(&sql, params_from_iter(values.iter()), |r| r.get(0)).map_err(map_err)
    };

    let (year, month) = (params.year, params.month);
    let current_month = sum_amount(
        format!("{year}-{month:02}-01"),
        format!("{year}-{month:02}-{:02}", last_day_of_month(year, month)),
    )?;

    let (lm_year, lm_month) = if month == 1 { (year - 1, 12) } else { (year, month - 1) };
    let last_month = sum_amount(
        format!("{lm_year}-{lm_month:02}-01"),
        format!("{lm_year}-{lm_month:02}-{:02}", last_day_of_month(lm_year, lm_month)),
    )?;

    let year_total = sum_amount(format!("{year}-01-01"), format!("{year}-12-31"))?;

    Ok(SummaryData { current_month, last_month, year_total })
}

pub fn get_yearly_category(
    conn: &Connection,
    params: &YearlyCategoryParams,
) -> AppResult<YearlyCategoryData> {
    let mut sql = String::from(
        "SELECT CAST(strftime('%Y', t.date) AS INTEGER) AS year_num,
                t.category_id, c.name AS category_name,
                SUM(t.amount) AS total
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.type = ?",
    );
    let mut values: Vec<Value> = vec![Value::Text(params.tx_type.clone())];
    if let Some(op) = params.operator_id {
        sql.push_str(" AND t.operator_id = ?");
        values.push(Value::Integer(op));
    }
    sql.push_str(" GROUP BY year_num, t.category_id ORDER BY year_num ASC, c.sort_order ASC");

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let raw_rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i32>("year_num")?,
                row.get::<_, i64>("category_id")?,
                row.get::<_, String>("category_name")?,
                row.get::<_, f64>("total")?,
            ))
        })
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;

    // 按首次出现顺序收集分类（尊重 sort_order）
    let mut categories: Vec<YearlyCategoryRef> = Vec::new();
    let mut cat_index: HashMap<i64, usize> = HashMap::new();
    for (_, category_id, category_name, _) in &raw_rows {
        if !cat_index.contains_key(category_id) {
            cat_index.insert(*category_id, categories.len());
            categories.push(YearlyCategoryRef { id: *category_id, name: category_name.clone() });
        }
    }

    // 按年 pivot（保持年份升序首现顺序）
    let mut year_order: Vec<i32> = Vec::new();
    let mut year_map: HashMap<i32, Vec<f64>> = HashMap::new();
    for (year_num, category_id, _, total) in &raw_rows {
        let amounts = year_map.entry(*year_num).or_insert_with(|| {
            year_order.push(*year_num);
            vec![0.0; categories.len()]
        });
        amounts[cat_index[category_id]] = *total;
    }

    let rows: Vec<YearlyCategoryRow> = year_order
        .into_iter()
        .map(|year| {
            let amounts = year_map.remove(&year).unwrap_or_default();
            let yearly = amounts.iter().sum();
            YearlyCategoryRow { year, amounts, yearly }
        })
        .collect();

    let mut total_amounts = vec![0.0; categories.len()];
    let mut total_yearly = 0.0;
    for row in &rows {
        for (i, v) in row.amounts.iter().enumerate() {
            total_amounts[i] += v;
        }
        total_yearly += row.yearly;
    }

    Ok(YearlyCategoryData {
        categories,
        rows,
        totals: YearlyCategoryTotals { amounts: total_amounts, yearly: total_yearly },
    })
}

/// Map<category_id, Map<year, total>>：仅常规支出（剔除偶发交易）
pub fn get_expense_annual_history(
    conn: &Connection,
    category_id: Option<i64>,
) -> AppResult<HashMap<i64, HashMap<i32, f64>>> {
    let mut sql = String::from(
        "SELECT CAST(strftime('%Y', t.date) AS INTEGER) AS year_num,
                t.category_id,
                SUM(t.amount) AS total
         FROM transactions t
         WHERE t.type = 'expense'
           AND t.is_occasional = 0",
    );
    let mut values: Vec<Value> = Vec::new();
    if let Some(id) = category_id {
        sql.push_str(" AND t.category_id = ?");
        values.push(Value::Integer(id));
    }
    sql.push_str(" GROUP BY year_num, t.category_id ORDER BY year_num ASC");

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let raw_rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i32>("year_num")?,
                row.get::<_, i64>("category_id")?,
                row.get::<_, f64>("total")?,
            ))
        })
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;

    let mut result: HashMap<i64, HashMap<i32, f64>> = HashMap::new();
    for (year, cat, total) in raw_rows {
        result.entry(cat).or_default().insert(year, total);
    }
    Ok(result)
}

/// Map<category_id, [12 个月支出]>（含偶发交易，作为当年实际值）
pub fn get_actual_monthly_expense(
    conn: &Connection,
    year: i32,
    category_id: Option<i64>,
) -> AppResult<HashMap<i64, Vec<f64>>> {
    let mut sql = String::from(
        "SELECT CAST(strftime('%m', t.date) AS INTEGER) AS month_num,
                t.category_id,
                SUM(t.amount) AS total
         FROM transactions t
         WHERE t.type = 'expense'
           AND t.date BETWEEN ? AND ?",
    );
    let mut values: Vec<Value> =
        vec![Value::Text(format!("{year}-01-01")), Value::Text(format!("{year}-12-31"))];
    if let Some(id) = category_id {
        sql.push_str(" AND t.category_id = ?");
        values.push(Value::Integer(id));
    }
    sql.push_str(" GROUP BY month_num, t.category_id");

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let raw_rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            Ok((
                row.get::<_, i64>("month_num")?,
                row.get::<_, i64>("category_id")?,
                row.get::<_, f64>("total")?,
            ))
        })
        .map_err(map_err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_err)?;

    let mut result: HashMap<i64, Vec<f64>> = HashMap::new();
    for (month, cat, total) in raw_rows {
        let months = result.entry(cat).or_insert_with(|| vec![0.0; 12]);
        if (1..=12).contains(&month) {
            months[(month - 1) as usize] = total;
        }
    }
    Ok(result)
}

pub fn get_year_range(conn: &Connection) -> AppResult<YearRangeData> {
    let (min_year, max_year): (Option<i32>, Option<i32>) = conn
        .query_row(
            "SELECT MIN(CAST(strftime('%Y', date) AS INTEGER)),
                    MAX(CAST(strftime('%Y', date) AS INTEGER))
             FROM transactions",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(map_err)?;

    let current_year = chrono::Local::now().format("%Y").to_string().parse::<i32>().unwrap_or(2026);
    Ok(YearRangeData {
        min_year: min_year.unwrap_or(current_year),
        max_year: max_year.unwrap_or(current_year),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    fn insert(conn: &Connection, date: &str, tx_type: &str, amount: f64, cat: i64, occasional: i64) {
        conn.execute(
            "INSERT INTO transactions (date, type, amount, category_id, description, is_occasional)
             VALUES (?1, ?2, ?3, ?4, '', ?5)",
            rusqlite::params![date, tx_type, amount, cat, occasional],
        )
        .unwrap();
    }

    #[test]
    fn cross_table_pivot() {
        let (_dir, conn) = fresh_test_db();
        insert(&conn, "2025-01-10", "expense", 100.0, 1, 0);
        insert(&conn, "2025-01-20", "expense", 50.0, 1, 0);
        insert(&conn, "2025-03-05", "expense", 30.0, 2, 0);
        insert(&conn, "2024-06-01", "expense", 999.0, 1, 0); // 不在 2025

        let data = get_cross_table(
            &conn,
            &CrossTableParams { year: 2025, tx_type: "expense".into(), operator_id: None },
        )
        .unwrap();

        assert_eq!(data.rows.len(), 2);
        let row1 = data.rows.iter().find(|r| r.category_id == 1).unwrap();
        assert_eq!(row1.months[0], 150.0);
        assert_eq!(row1.yearly, 150.0);
        assert_eq!(data.totals.yearly, 180.0);
        assert_eq!(data.totals.months[2], 30.0);
    }

    #[test]
    fn summary_handles_january() {
        let (_dir, conn) = fresh_test_db();
        insert(&conn, "2025-01-15", "expense", 100.0, 1, 0);
        insert(&conn, "2024-12-15", "expense", 70.0, 1, 0);

        let s = get_summary(
            &conn,
            &SummaryParams { year: 2025, month: 1, tx_type: "expense".into(), operator_id: None },
        )
        .unwrap();
        assert_eq!(s.current_month, 100.0);
        assert_eq!(s.last_month, 70.0); // 跨年取上年 12 月
        assert_eq!(s.year_total, 100.0);
    }

    #[test]
    fn yearly_category_and_year_range() {
        let (_dir, conn) = fresh_test_db();
        insert(&conn, "2024-05-01", "expense", 10.0, 1, 0);
        insert(&conn, "2025-05-01", "expense", 20.0, 1, 0);
        insert(&conn, "2025-06-01", "expense", 5.0, 2, 0);

        let data = get_yearly_category(
            &conn,
            &YearlyCategoryParams { tx_type: "expense".into(), operator_id: None },
        )
        .unwrap();
        assert_eq!(data.rows.len(), 2);
        assert_eq!(data.totals.yearly, 35.0);

        let range = get_year_range(&conn).unwrap();
        assert_eq!(range.min_year, 2024);
        assert_eq!(range.max_year, 2025);
    }

    #[test]
    fn annual_history_excludes_occasional() {
        let (_dir, conn) = fresh_test_db();
        insert(&conn, "2024-05-01", "expense", 10.0, 1, 0);
        insert(&conn, "2024-06-01", "expense", 99.0, 1, 1); // 偶发，剔除
        let history = get_expense_annual_history(&conn, None).unwrap();
        assert_eq!(history[&1][&2024], 10.0);

        let monthly = get_actual_monthly_expense(&conn, 2024, None).unwrap();
        // 实际月度含偶发
        assert_eq!(monthly[&1][4], 10.0);
        assert_eq!(monthly[&1][5], 99.0);
    }
}

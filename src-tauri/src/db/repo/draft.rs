use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, Row};

use crate::error::{AppError, AppResult};
use crate::models::{DraftSummary, ImportDraft, SaveDraftDTO};

fn map_err(e: rusqlite::Error) -> AppError {
    AppError::Db(e.to_string())
}

fn draft_from_row(row: &Row) -> rusqlite::Result<(String, String, String, String, String)> {
    Ok((
        row.get("id")?,
        row.get("source")?,
        row.get("data")?,
        row.get("created_at")?,
        row.get("updated_at")?,
    ))
}

pub fn find_one(conn: &Connection) -> AppResult<Option<ImportDraft>> {
    match conn.query_row("SELECT * FROM import_draft WHERE id = ?1", ["current"], draft_from_row) {
        Ok((id, source, data, created_at, updated_at)) => Ok(Some(ImportDraft {
            id,
            source,
            data: serde_json::from_str(&data).unwrap_or(serde_json::Value::Null),
            created_at,
            updated_at,
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(map_err(e)),
    }
}

pub fn get_summary(conn: &Connection) -> AppResult<DraftSummary> {
    let Some(draft) = find_one(conn)? else {
        return Ok(DraftSummary { exists: false, ..Default::default() });
    };

    let transactions = draft
        .data
        .get("transactions")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    let missing = transactions
        .iter()
        .filter(|t| t.get("category_id").is_none_or(|v| v.is_null()))
        .count() as i64;

    Ok(DraftSummary {
        exists: true,
        source: Some(draft.source),
        count: transactions.len() as i64,
        missing_category_count: missing,
        created_at: Some(draft.created_at),
        updated_at: Some(draft.updated_at),
    })
}

pub fn save(conn: &Connection, dto: &SaveDraftDTO) -> AppResult<ImportDraft> {
    let data_json = serde_json::to_string(&dto.data)?;
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    conn.execute(
        "INSERT INTO import_draft (id, source, data, created_at, updated_at)
         VALUES (?1, ?2, ?3, COALESCE((SELECT created_at FROM import_draft WHERE id = ?4), ?5), ?6)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           data = excluded.data,
           updated_at = excluded.updated_at",
        rusqlite::params!["current", dto.source, data_json, "current", now, now],
    )
    .map_err(map_err)?;

    find_one(conn)?.ok_or_else(|| AppError::Db("草稿保存后读取失败".into()))
}

pub fn remove(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM import_draft WHERE id = ?1", ["current"]).map_err(map_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    #[test]
    fn draft_upsert_and_summary() {
        let (_dir, conn) = fresh_test_db();
        assert!(find_one(&conn).unwrap().is_none());
        assert!(!get_summary(&conn).unwrap().exists);

        let dto = SaveDraftDTO {
            source: "mcp".into(),
            data: serde_json::json!({
                "transactions": [
                    {"key": "1", "date": "2025-01-01", "type": "expense", "amount": 5, "category_id": 1, "description": "", "operator_id": null},
                    {"key": "2", "date": "2025-01-02", "type": "expense", "amount": 6, "category_id": null, "description": "", "operator_id": null}
                ],
                "operatorId": null
            }),
        };
        let saved = save(&conn, &dto).unwrap();
        assert_eq!(saved.id, "current");
        let created_at = saved.created_at.clone();

        let summary = get_summary(&conn).unwrap();
        assert!(summary.exists);
        assert_eq!(summary.count, 2);
        assert_eq!(summary.missing_category_count, 1);

        // upsert 保留 created_at
        let saved2 = save(&conn, &dto).unwrap();
        assert_eq!(saved2.created_at, created_at);

        remove(&conn).unwrap();
        assert!(find_one(&conn).unwrap().is_none());
    }
}

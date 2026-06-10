//! 文件对话框 + 受限文件读写 + 全量导入。
//! xlsx/csv 的解析与生成在渲染层（xlsx-js-style）完成，这里只负责：
//! - 系统对话框（Rust API，路径进白名单）
//! - 白名单内文件的字节读写
//! - import_execute：单 SQL 事务内全量覆盖导入

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::db::repo::{category, operator, transaction};
use crate::db::{self, Db};
use crate::error::{AppError, AppResult};
use crate::models::{CreateCategoryDTO, CreateTransactionDTO};
use crate::services::forecast::ForecastCache;

/// 本会话内经对话框确认过的路径（file_read/file_write 只接受这些）
#[derive(Default)]
pub struct AllowedPaths(pub Mutex<HashSet<PathBuf>>);

#[derive(Debug, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn dialog_open_file(
    app: tauri::AppHandle,
    allowed: State<'_, AllowedPaths>,
    filters: Vec<FileFilter>,
) -> AppResult<Option<String>> {
    let mut builder = app.dialog().file();
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    let picked = builder.blocking_pick_file();
    Ok(match picked {
        Some(path) => {
            let path = path.into_path().map_err(|e| AppError::msg(e.to_string()))?;
            allowed.0.lock().unwrap().insert(path.clone());
            Some(path.to_string_lossy().to_string())
        }
        None => None,
    })
}

#[tauri::command]
pub async fn dialog_save_file(
    app: tauri::AppHandle,
    allowed: State<'_, AllowedPaths>,
    filters: Vec<FileFilter>,
    default_name: String,
) -> AppResult<Option<String>> {
    let mut builder = app.dialog().file().set_file_name(&default_name);
    for f in &filters {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&f.name, &exts);
    }
    let picked = builder.blocking_save_file();
    Ok(match picked {
        Some(path) => {
            let path = path.into_path().map_err(|e| AppError::msg(e.to_string()))?;
            allowed.0.lock().unwrap().insert(path.clone());
            Some(path.to_string_lossy().to_string())
        }
        None => None,
    })
}

fn check_allowed(allowed: &AllowedPaths, path: &str) -> AppResult<PathBuf> {
    let path = PathBuf::from(path);
    if allowed.0.lock().unwrap().contains(&path) {
        Ok(path)
    } else {
        Err(AppError::msg("路径未经文件对话框授权"))
    }
}

/// 读取对话框选中的文件，二进制直传渲染层（ArrayBuffer）
#[tauri::command]
pub async fn file_read(
    allowed: State<'_, AllowedPaths>,
    path: String,
) -> AppResult<tauri::ipc::Response> {
    let path = check_allowed(&allowed, &path)?;
    let bytes = std::fs::read(&path)?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 写入对话框确认的保存路径
#[tauri::command]
pub async fn file_write(
    allowed: State<'_, AllowedPaths>,
    path: String,
    contents: Vec<u8>,
) -> AppResult<()> {
    let path = check_allowed(&allowed, &path)?;
    std::fs::write(&path, contents)?;
    Ok(())
}

// ---------- 全量导入 ----------

#[derive(Debug, Deserialize)]
pub struct ImportRow {
    pub date: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: f64,
    #[serde(rename = "categoryName")]
    pub category_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "operatorName", default)]
    pub operator_name: String,
    #[serde(rename = "createdAt", default)]
    pub created_at: Option<String>,
    #[serde(rename = "isOccasional", default)]
    pub is_occasional: bool,
}

#[derive(Debug, Deserialize)]
pub struct ImportCategory {
    pub name: String,
    #[serde(rename = "type")]
    pub cat_type: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportPreview {
    pub rows: Vec<ImportRow>,
    #[serde(rename = "uniqueOperators")]
    pub unique_operators: Vec<String>,
    #[serde(rename = "uniqueCategories")]
    pub unique_categories: Vec<ImportCategory>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: i64,
    #[serde(rename = "operatorsCreated")]
    pub operators_created: i64,
    #[serde(rename = "categoriesCreated")]
    pub categories_created: i64,
}

/// 全量覆盖导入：与旧 executeImport 语义一致 —— 清空交易和操作人、
/// 按名建操作人/分类、批量插入，整体在单个 SQL 事务中。
#[tauri::command]
pub async fn import_execute(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    preview: ImportPreview,
) -> AppResult<ImportResult> {
    let result = db::with_db(&db, |conn| run_import(conn, &preview))?;
    cache.invalidate();
    Ok(result)
}

pub fn run_import(conn: &rusqlite::Connection, preview: &ImportPreview) -> AppResult<ImportResult> {
    conn.execute_batch("BEGIN").map_err(|e| AppError::Db(e.to_string()))?;
    let inner = (|| -> AppResult<ImportResult> {
        let mut operators_created = 0i64;
        let mut categories_created = 0i64;

        transaction::delete_all(conn)?;
        operator::delete_all(conn)?;

        let mut operator_map = std::collections::HashMap::new();
        for name in &preview.unique_operators {
            let op = operator::create(conn, name)?;
            operator_map.insert(name.clone(), op.id);
            operators_created += 1;
        }

        let mut category_map = std::collections::HashMap::new();
        for cat in &preview.unique_categories {
            let key = format!("{}:{}", cat.name, cat.cat_type);
            match category::find_by_name_and_type(conn, &cat.name, &cat.cat_type)? {
                Some(existing) => {
                    category_map.insert(key, existing.id);
                }
                None => {
                    let created = category::create(
                        conn,
                        &CreateCategoryDTO {
                            name: cat.name.clone(),
                            cat_type: cat.cat_type.clone(),
                            icon: None,
                            description: None,
                            sort_order: None,
                        },
                    )?;
                    category_map.insert(key, created.id);
                    categories_created += 1;
                }
            }
        }

        let dtos: Vec<CreateTransactionDTO> = preview
            .rows
            .iter()
            .map(|row| {
                let category_id = category_map
                    .get(&format!("{}:{}", row.category_name, row.tx_type))
                    .copied()
                    .ok_or_else(|| AppError::msg(format!("分类映射缺失: {}", row.category_name)))?;
                Ok(CreateTransactionDTO {
                    date: row.date.clone(),
                    tx_type: row.tx_type.clone(),
                    amount: row.amount,
                    category_id,
                    description: Some(row.description.clone()),
                    operator_id: if row.operator_name.is_empty() {
                        None
                    } else {
                        operator_map.get(&row.operator_name).copied()
                    },
                    created_at: row.created_at.clone(),
                    is_occasional: Some(row.is_occasional),
                })
            })
            .collect::<AppResult<Vec<_>>>()?;

        insert_rows(conn, &dtos)?;

        Ok(ImportResult {
            imported: preview.rows.len() as i64,
            operators_created,
            categories_created,
        })
    })();
    match inner {
        Ok(r) => {
            conn.execute_batch("COMMIT").map_err(|e| AppError::Db(e.to_string()))?;
            Ok(r)
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

fn insert_rows(conn: &rusqlite::Connection, items: &[CreateTransactionDTO]) -> AppResult<()> {
    let map_err = |e: rusqlite::Error| AppError::Db(e.to_string());
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
                    item.date, item.tx_type, item.amount, item.category_id,
                    description, item.operator_id, created_at, occasional,
                ])
                .map_err(map_err)?;
        } else {
            stmt_default_time
                .execute(rusqlite::params![
                    item.date, item.tx_type, item.amount, item.category_id,
                    description, item.operator_id, occasional,
                ])
                .map_err(map_err)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::fresh_test_db;

    fn sample_preview() -> ImportPreview {
        ImportPreview {
            rows: vec![
                ImportRow {
                    date: "2025-01-01".into(),
                    tx_type: "expense".into(),
                    amount: 10.0,
                    category_name: "新分类A".into(),
                    description: "x".into(),
                    operator_name: "张三".into(),
                    created_at: Some("2025-01-01 08:00:00".into()),
                    is_occasional: true,
                },
                ImportRow {
                    date: "2025-01-02".into(),
                    tx_type: "income".into(),
                    amount: 100.0,
                    category_name: "工资".into(),
                    description: String::new(),
                    operator_name: String::new(),
                    created_at: None,
                    is_occasional: false,
                },
            ],
            unique_operators: vec!["张三".into()],
            unique_categories: vec![
                ImportCategory { name: "新分类A".into(), cat_type: "expense".into() },
                ImportCategory { name: "工资".into(), cat_type: "income".into() },
            ],
        }
    }

    #[test]
    fn import_replaces_all_and_creates_entities() {
        let (_dir, conn) = fresh_test_db();
        conn.execute(
            "INSERT INTO transactions (date, type, amount, category_id, description) VALUES ('2020-01-01','expense',1,1,'old')",
            [],
        )
        .unwrap();

        let result = run_import(&conn, &sample_preview()).unwrap();
        assert_eq!(result.imported, 2);
        assert_eq!(result.operators_created, 1);
        // "工资" 是系统预置收入分类 → 只新建 1 个
        assert_eq!(result.categories_created, 1);

        // 旧数据被清空
        let old: i64 = conn
            .query_row("SELECT count(*) FROM transactions WHERE description='old'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(old, 0);

        // created_at 保留、偶发标记入库
        let (created_at, occ): (String, i64) = conn
            .query_row(
                "SELECT created_at, is_occasional FROM transactions WHERE date='2025-01-01'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(created_at, "2025-01-01 08:00:00");
        assert_eq!(occ, 1);

        // 再导一遍（幂等全量覆盖）
        let again = run_import(&conn, &sample_preview()).unwrap();
        assert_eq!(again.imported, 2);
        let total: i64 = conn
            .query_row("SELECT count(*) FROM transactions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 2);
    }
}

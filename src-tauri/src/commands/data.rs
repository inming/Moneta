use serde::Serialize;
use tauri::State;

use crate::db::repo::{category, draft, operator, stats, transaction};
use crate::db::{self, Db};
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::services::forecast::{self, ForecastCache};

// ---------- transaction ----------

#[derive(Serialize)]
pub struct CountResult {
    pub count: i64,
}

#[tauri::command]
pub async fn transaction_list(
    db: State<'_, Db>,
    params: TransactionListParams,
) -> AppResult<PaginatedResult<Transaction>> {
    db::with_db(&db, |conn| transaction::find_all(conn, &params))
}

#[tauri::command]
pub async fn transaction_create(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    data: CreateTransactionDTO,
) -> AppResult<Transaction> {
    let result = db::with_db(&db, |conn| transaction::create(conn, &data))?;
    cache.invalidate();
    Ok(result)
}

#[tauri::command]
pub async fn transaction_update(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    id: i64,
    data: UpdateTransactionDTO,
) -> AppResult<Transaction> {
    let result = db::with_db(&db, |conn| transaction::update(conn, id, &data))?;
    cache.invalidate();
    Ok(result)
}

#[tauri::command]
pub async fn transaction_delete(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    id: i64,
) -> AppResult<()> {
    db::with_db(&db, |conn| transaction::remove(conn, id))?;
    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn transaction_batch_create(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    items: Vec<CreateTransactionDTO>,
) -> AppResult<CountResult> {
    db::with_db(&db, |conn| transaction::batch_create(conn, &items))?;
    cache.invalidate();
    Ok(CountResult { count: items.len() as i64 })
}

#[tauri::command]
pub async fn transaction_batch_delete(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    ids: Vec<i64>,
) -> AppResult<CountResult> {
    let count = db::with_db(&db, |conn| transaction::batch_delete(conn, &ids))?;
    cache.invalidate();
    Ok(CountResult { count })
}

// ---------- category ----------

#[tauri::command]
pub async fn category_list(
    db: State<'_, Db>,
    category_type: Option<String>,
) -> AppResult<Vec<Category>> {
    db::with_db(&db, |conn| category::find_all(conn, category_type.as_deref()))
}

#[tauri::command]
pub async fn category_list_all(
    db: State<'_, Db>,
    category_type: Option<String>,
) -> AppResult<Vec<Category>> {
    db::with_db(&db, |conn| category::find_all_include_inactive(conn, category_type.as_deref()))
}

#[tauri::command]
pub async fn category_create(db: State<'_, Db>, data: CreateCategoryDTO) -> AppResult<Category> {
    db::with_db(&db, |conn| category::create(conn, &data))
}

#[tauri::command]
pub async fn category_update(
    db: State<'_, Db>,
    id: i64,
    data: UpdateCategoryDTO,
) -> AppResult<Category> {
    db::with_db(&db, |conn| category::update(conn, id, &data))
}

#[tauri::command]
pub async fn category_delete(db: State<'_, Db>, id: i64) -> AppResult<DeleteCategoryResult> {
    db::with_db(&db, |conn| category::remove(conn, id))
}

#[tauri::command]
pub async fn category_reorder(
    db: State<'_, Db>,
    category_type: String,
    ids: Vec<i64>,
) -> AppResult<()> {
    db::with_db(&db, |conn| category::reorder(conn, &category_type, &ids))
}

// ---------- operator ----------

#[tauri::command]
pub async fn operator_list(db: State<'_, Db>) -> AppResult<Vec<Operator>> {
    db::with_db(&db, operator::find_all)
}

#[tauri::command]
pub async fn operator_create(db: State<'_, Db>, name: String) -> AppResult<Operator> {
    db::with_db(&db, |conn| operator::create(conn, &name))
}

#[tauri::command]
pub async fn operator_update(db: State<'_, Db>, id: i64, name: String) -> AppResult<Operator> {
    db::with_db(&db, |conn| operator::update(conn, id, &name))
}

#[tauri::command]
pub async fn operator_delete(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db::with_db(&db, |conn| operator::remove(conn, id))
}

// ---------- stats ----------

#[tauri::command]
pub async fn stats_cross_table(
    db: State<'_, Db>,
    params: CrossTableParams,
) -> AppResult<CrossTableData> {
    db::with_db(&db, |conn| stats::get_cross_table(conn, &params))
}

#[tauri::command]
pub async fn stats_summary(db: State<'_, Db>, params: SummaryParams) -> AppResult<SummaryData> {
    db::with_db(&db, |conn| stats::get_summary(conn, &params))
}

#[tauri::command]
pub async fn stats_year_range(db: State<'_, Db>) -> AppResult<YearRangeData> {
    db::with_db(&db, stats::get_year_range)
}

#[tauri::command]
pub async fn stats_yearly_category(
    db: State<'_, Db>,
    params: YearlyCategoryParams,
) -> AppResult<YearlyCategoryData> {
    db::with_db(&db, |conn| stats::get_yearly_category(conn, &params))
}

#[tauri::command]
pub async fn stats_forecast(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    params: ForecastParams,
) -> AppResult<ForecastResult> {
    db::with_db(&db, |conn| forecast::compute_forecast(&cache, conn, &params))
}

// ---------- draft ----------

#[tauri::command]
pub async fn draft_get(db: State<'_, Db>) -> AppResult<Option<ImportDraft>> {
    db::with_db(&db, draft::find_one)
}

#[tauri::command]
pub async fn draft_save(db: State<'_, Db>, dto: SaveDraftDTO) -> AppResult<ImportDraft> {
    db::with_db(&db, |conn| draft::save(conn, &dto))
}

#[tauri::command]
pub async fn draft_delete(db: State<'_, Db>) -> AppResult<()> {
    db::with_db(&db, draft::remove)
}

#[tauri::command]
pub async fn draft_get_summary(db: State<'_, Db>) -> AppResult<DraftSummary> {
    db::with_db(&db, draft::get_summary)
}

// ---------- data 管理 ----------

#[tauri::command]
pub async fn data_clear_transactions(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
) -> AppResult<()> {
    db::with_db(&db, |conn| {
        conn.execute_batch("BEGIN").map_err(|e| AppError::Db(e.to_string()))?;
        let result = transaction::delete_all(conn).and_then(|_| operator::delete_all(conn));
        match result {
            Ok(()) => conn.execute_batch("COMMIT").map_err(|e| AppError::Db(e.to_string())),
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })?;
    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn data_factory_reset(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
) -> AppResult<()> {
    db::with_db(&db, |conn| {
        conn.execute_batch("BEGIN").map_err(|e| AppError::Db(e.to_string()))?;
        let result = transaction::delete_all(conn)
            .and_then(|_| operator::delete_all(conn))
            .and_then(|_| category::delete_all_custom(conn))
            .and_then(|_| category::reset_system_categories(conn));
        match result {
            Ok(()) => conn.execute_batch("COMMIT").map_err(|e| AppError::Db(e.to_string())),
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    })?;
    cache.invalidate();
    Ok(())
}

// ---------- export（数据查询侧；文件生成在渲染层）----------

#[tauri::command]
pub async fn export_count(db: State<'_, Db>, params: TransactionListParams) -> AppResult<i64> {
    db::with_db(&db, |conn| transaction::count_for_export(conn, &params))
}

#[tauri::command]
pub async fn export_query(
    db: State<'_, Db>,
    params: TransactionListParams,
) -> AppResult<Vec<ExportRow>> {
    db::with_db(&db, |conn| transaction::find_all_for_export(conn, &params))
}

//! 与 src/shared/types/*.ts 一一对应的数据模型。
//! 字段名以 TS 为唯一真源：实体字段是 snake_case（category_id…），
//! 部分参数/结果是 camelCase（pageSize、currentMonth…），混合命名，
//! 全部显式标注，禁止 rename_all。

use serde::{Deserialize, Deserializer, Serialize};

/// 区分 "字段缺失"（不更新）与 "显式 null"（置空）的 double-Option
pub fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(de).map(Some)
}

// ---------- Transaction ----------

#[derive(Debug, Clone, Serialize)]
pub struct Transaction {
    pub id: i64,
    pub date: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: f64,
    pub category_id: i64,
    pub description: String,
    pub operator_id: Option<i64>,
    pub is_occasional: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTransactionDTO {
    pub date: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: f64,
    pub category_id: i64,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub operator_id: Option<i64>,
    /// 导入路径会带历史时间（旧 CreateTransactionWithTimeDTO）
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub is_occasional: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateTransactionDTO {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(rename = "type", default)]
    pub tx_type: Option<String>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub operator_id: Option<Option<i64>>,
    #[serde(default)]
    pub is_occasional: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct TransactionListParams {
    #[serde(default)]
    pub page: Option<i64>,
    #[serde(rename = "pageSize", default)]
    pub page_size: Option<i64>,
    #[serde(rename = "dateFrom", default)]
    pub date_from: Option<String>,
    #[serde(rename = "dateTo", default)]
    pub date_to: Option<String>,
    #[serde(rename = "type", default)]
    pub tx_type: Option<String>,
    #[serde(default)]
    pub types: Option<Vec<String>>,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub category_ids: Option<Vec<i64>>,
    #[serde(default)]
    pub operator_id: Option<i64>,
    #[serde(default)]
    pub operator_ids: Option<Vec<i64>>,
    #[serde(default)]
    pub keyword: Option<String>,
    #[serde(rename = "sortField", default)]
    pub sort_field: Option<String>,
    #[serde(rename = "sortOrder", default)]
    pub sort_order: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
}

/// 导出行（供渲染层 xlsx/csv 生成）；is_occasional 保持 0/1 与旧实现一致
#[derive(Debug, Clone, Serialize)]
pub struct ExportRow {
    pub date: String,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: f64,
    pub category_name: String,
    pub description: String,
    pub operator_name: String,
    pub created_at: String,
    pub is_occasional: i64,
}

// ---------- Category ----------

#[derive(Debug, Clone, Serialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub cat_type: String,
    pub icon: Option<String>,
    pub description: String,
    pub sort_order: i64,
    pub is_system: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCategoryDTO {
    pub name: String,
    #[serde(rename = "type")]
    pub cat_type: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateCategoryDTO {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeleteCategoryResult {
    #[serde(rename = "softDeleted")]
    pub soft_deleted: bool,
}

// ---------- Operator ----------

#[derive(Debug, Clone, Serialize)]
pub struct Operator {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
}

// ---------- Stats ----------

#[derive(Debug, Clone, Deserialize)]
pub struct CrossTableParams {
    pub year: i32,
    #[serde(rename = "type")]
    pub tx_type: String,
    #[serde(default)]
    pub operator_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrossTableRow {
    pub category_id: i64,
    pub category_name: String,
    pub months: Vec<f64>,
    pub yearly: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrossTableTotals {
    pub months: Vec<f64>,
    pub yearly: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CrossTableData {
    pub rows: Vec<CrossTableRow>,
    pub totals: CrossTableTotals,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SummaryParams {
    pub year: i32,
    pub month: u32,
    #[serde(rename = "type")]
    pub tx_type: String,
    #[serde(default)]
    pub operator_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SummaryData {
    #[serde(rename = "currentMonth")]
    pub current_month: f64,
    #[serde(rename = "lastMonth")]
    pub last_month: f64,
    #[serde(rename = "yearTotal")]
    pub year_total: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearRangeData {
    #[serde(rename = "minYear")]
    pub min_year: i32,
    #[serde(rename = "maxYear")]
    pub max_year: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct YearlyCategoryParams {
    #[serde(rename = "type")]
    pub tx_type: String,
    #[serde(default)]
    pub operator_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearlyCategoryRef {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearlyCategoryRow {
    pub year: i32,
    pub amounts: Vec<f64>,
    pub yearly: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearlyCategoryTotals {
    pub amounts: Vec<f64>,
    pub yearly: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearlyCategoryData {
    pub categories: Vec<YearlyCategoryRef>,
    pub rows: Vec<YearlyCategoryRow>,
    pub totals: YearlyCategoryTotals,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ForecastParams {
    #[serde(default)]
    pub category_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForecastMonthData {
    pub amount: f64,
    #[serde(rename = "isActual")]
    pub is_actual: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForecastResult {
    pub months: Vec<ForecastMonthData>,
    #[serde(rename = "totalForecast")]
    pub total_forecast: f64,
}

// ---------- Import Draft ----------

#[derive(Debug, Clone, Serialize)]
pub struct ImportDraft {
    pub id: String,
    pub source: String,
    /// DraftData 原样透传（渲染层定义结构）
    pub data: serde_json::Value,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveDraftDTO {
    pub source: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DraftSummary {
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub count: i64,
    #[serde(rename = "missingCategoryCount")]
    pub missing_category_count: i64,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt", skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(value: &serde_json::Value) -> Vec<String> {
        // serde_json::Map 默认按字母排序，做集合比较
        value.as_object().unwrap().keys().cloned().collect()
    }

    fn sorted(mut v: Vec<&str>) -> Vec<String> {
        v.sort_unstable();
        v.into_iter().map(String::from).collect()
    }

    /// JSON 字段名与 src/shared/types/*.ts 逐字对齐（混合命名是历史契约）
    #[test]
    fn serde_field_names_match_ts_contract() {
        let tx = Transaction {
            id: 1,
            date: "2025-01-01".into(),
            tx_type: "expense".into(),
            amount: 1.0,
            category_id: 2,
            description: String::new(),
            operator_id: None,
            is_occasional: false,
            created_at: String::new(),
            updated_at: String::new(),
        };
        assert_eq!(
            keys(&serde_json::to_value(&tx).unwrap()),
            sorted(vec!["id", "date", "type", "amount", "category_id", "description", "operator_id", "is_occasional", "created_at", "updated_at"])
        );

        let page = PaginatedResult { items: vec![tx], total: 1, page: 1, page_size: 50 };
        assert_eq!(keys(&serde_json::to_value(&page).unwrap()), sorted(vec!["items", "total", "page", "pageSize"]));

        let summary = SummaryData { current_month: 0.0, last_month: 0.0, year_total: 0.0 };
        assert_eq!(keys(&serde_json::to_value(&summary).unwrap()), sorted(vec!["currentMonth", "lastMonth", "yearTotal"]));

        let range = YearRangeData { min_year: 2024, max_year: 2025 };
        assert_eq!(keys(&serde_json::to_value(&range).unwrap()), sorted(vec!["minYear", "maxYear"]));

        let forecast = ForecastResult {
            months: vec![ForecastMonthData { amount: 0.0, is_actual: true }],
            total_forecast: 0.0,
        };
        let f = serde_json::to_value(&forecast).unwrap();
        assert_eq!(keys(&f), sorted(vec!["months", "totalForecast"]));
        assert_eq!(keys(&f["months"][0]), sorted(vec!["amount", "isActual"]));

        // UpdateTransactionDTO 的 double-Option：缺失 ≠ 显式 null
        let absent: UpdateTransactionDTO = serde_json::from_str("{}").unwrap();
        assert!(absent.operator_id.is_none());
        let explicit_null: UpdateTransactionDTO =
            serde_json::from_str(r#"{"operator_id": null}"#).unwrap();
        assert_eq!(explicit_null.operator_id, Some(None));
        let with_value: UpdateTransactionDTO =
            serde_json::from_str(r#"{"operator_id": 3}"#).unwrap();
        assert_eq!(with_value.operator_id, Some(Some(3)));
    }
}

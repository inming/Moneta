use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, ServerCapabilities, ServerInfo};
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler};
use serde::Deserialize;

use crate::http_client;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetCategoriesParams {
    /// 分类类型筛选（可选）：expense / income / investment
    #[serde(default)]
    pub r#type: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpTransaction {
    /// 日期，格式 YYYY-MM-DD
    pub date: String,
    /// 交易类型：expense / income / investment
    pub r#type: String,
    /// 金额，正数或负数（负数表示退款）
    pub amount: f64,
    /// 分类 ID（可选）
    #[serde(default)]
    pub category_id: Option<i64>,
    /// 分类名称建议（可选）
    #[serde(default)]
    pub category_name: Option<String>,
    /// 交易描述
    pub description: String,
    /// 操作人 ID（可选）
    #[serde(default)]
    pub operator_id: Option<i64>,
    /// 操作人名称（可选）
    #[serde(default)]
    pub operator_name: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SendTransactionsParams {
    /// 交易记录数组
    pub transactions: Vec<McpTransaction>,
    /// 数据来源描述
    pub source: String,
}

fn text_result(text: String) -> CallToolResult {
    CallToolResult::success(vec![Content::text(text)])
}

fn error_result(text: String) -> CallToolResult {
    CallToolResult::error(vec![Content::text(text)])
}

#[derive(Clone)]
pub struct MonetaServer {
    // 由 #[tool_handler]/#[tool_router] 宏在 trait 分发时读取
    #[allow(dead_code)]
    tool_router: ToolRouter<MonetaServer>,
}

impl MonetaServer {
    pub fn new() -> Self {
        MonetaServer { tool_router: Self::tool_router() }
    }
}

#[tool_router]
impl MonetaServer {
    #[tool(name = "get_categories", description = r#"获取 Moneta 记账软件中的交易分类列表。

使用场景：
1. 当用户想要导入账单文件时，先获取分类列表以便智能匹配
2. 根据分类的 name 和 description 字段进行语义匹配
3. 返回的分类包含 id、name、type、description（AI 描述）、sort_order

示例匹配规则：
- "美团外卖" → 匹配 name="正餐"（description 包含"外卖"）
- "滴滴出行" → 匹配 name="交通"（description 包含"打车"）
- "工资" → 匹配 name="工资"（收入分类）

参数：
- type: 可选，筛选特定类型（expense/income/investment），不填返回全部分类

返回：分类对象数组，每个对象包含 id、name、type、description、sort_order"#)]
    async fn get_categories(
        &self,
        Parameters(params): Parameters<GetCategoriesParams>,
    ) -> Result<CallToolResult, McpError> {
        let mut query: Vec<(&str, &str)> = Vec::new();
        if let Some(t) = params.r#type.as_deref() {
            query.push(("type", t));
        }
        Ok(match http_client::get_json("/api/categories", &query).await {
            Ok(categories) => {
                text_result(serde_json::to_string_pretty(&categories).unwrap_or_default())
            }
            Err(e) => error_result(format!("获取分类失败: {e}")),
        })
    }

    #[tool(name = "get_operators", description = r#"获取 Moneta 记账软件中的操作人列表。

使用场景：
1. 当用户导入账单时，需要知道有哪些操作人可供选择
2. 将交易记录关联到特定的操作人

返回：操作人对象数组，每个对象包含 id、name"#)]
    async fn get_operators(&self) -> Result<CallToolResult, McpError> {
        Ok(match http_client::get_json("/api/operators", &[]).await {
            Ok(operators) => {
                text_result(serde_json::to_string_pretty(&operators).unwrap_or_default())
            }
            Err(e) => error_result(format!("获取操作人失败: {e}")),
        })
    }

    #[tool(name = "send_transactions", description = r#"将转换好的交易数据发送给 Moneta，打开确认界面供用户审核。

使用场景：
1. AI 分析完账单文件后，将解析好的交易数据发送到 Moneta
2. 用户会在 Moneta 应用中看到一个确认界面，可以编辑、删除或补充分类
3. 用户确认后，数据才会正式写入数据库

参数：
- transactions: 交易记录数组，每项包含：
  - date: 日期 (YYYY-MM-DD)
  - type: 类型 (expense/income/investment)
  - amount: 金额（正数或负数，负数表示退款/冲正）
  - category_id: 分类 ID（可选，不确定时留空）
  - category_name: 分类名称（用于显示建议）
  - description: 描述
  - operator_id: 操作人 ID（可选）
  - operator_name: 操作人名称（可选）
- source: 数据来源描述（如 "支付宝账单 2024-01"）

注意：
- 金额支持正数和负数，负数表示退款/冲正
- 金额不能为 0
- 未匹配的分类可以留空 category_id，用户在确认界面补充"#)]
    async fn send_transactions(
        &self,
        Parameters(params): Parameters<SendTransactionsParams>,
    ) -> Result<CallToolResult, McpError> {
        if params.transactions.is_empty() {
            return Ok(error_result("错误: transactions 必须是非空数组".into()));
        }
        for tx in &params.transactions {
            if tx.date.is_empty() || tx.r#type.is_empty() || tx.description.is_empty() {
                return Ok(error_result(
                    "错误: 每条交易记录必须包含 date、type、amount、description 字段".into(),
                ));
            }
            if tx.amount == 0.0 {
                return Ok(error_result("错误: 金额不能为 0".into()));
            }
            if !["expense", "income", "investment"].contains(&tx.r#type.as_str()) {
                return Ok(error_result(format!(
                    "错误: 无效的类型 \"{}\"，必须是 expense、income 或 investment",
                    tx.r#type
                )));
            }
        }

        let count = params.transactions.len();
        let source = params.source.clone();
        let body = serde_json::json!({
            "transactions": params.transactions.iter().map(|tx| serde_json::json!({
                "date": tx.date,
                "type": tx.r#type,
                "amount": tx.amount,
                "category_id": tx.category_id,
                "category_name": tx.category_name,
                "description": tx.description,
                "operator_id": tx.operator_id,
                "operator_name": tx.operator_name,
            })).collect::<Vec<_>>(),
            "source": source,
        });

        Ok(match http_client::post_json("/mcp-import", &body).await {
            Ok(_) => text_result(format!(
                "成功发送 {count} 条交易记录到 Moneta。\n\n请在 Moneta 应用的确认界面中审核数据，补充未匹配的分类后确认导入。\n\n数据来源: {source}"
            )),
            Err(e) => error_result(format!("发送失败: {e}\n\n请确保 Moneta 应用正在运行。")),
        })
    }
}

#[tool_handler]
impl ServerHandler for MonetaServer {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo / Implementation 是 non_exhaustive，只能基于 Default 赋值
        let mut server_info = rmcp::model::Implementation::default();
        server_info.name = "moneta-mcp".into();
        server_info.version = "0.5.0".into();

        let mut info = ServerInfo::default();
        info.server_info = server_info;
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info
    }
}

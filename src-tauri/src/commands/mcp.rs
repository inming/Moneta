use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::repo::transaction;
use crate::db::{self, Db};
use crate::error::AppResult;
use crate::mcp::{self, claude_config, http_server, McpImportRequest, McpState};
use crate::models::CreateTransactionDTO;
use crate::services::forecast::ForecastCache;

#[derive(Serialize)]
pub struct McpConfigResult {
    pub success: bool,
    pub message: String,
    #[serde(rename = "needsRestart")]
    pub needs_restart: bool,
}

#[derive(Serialize)]
pub struct McpStatus {
    pub configured: bool,
    #[serde(rename = "serverRunning")]
    pub server_running: bool,
    pub port: u16,
    #[serde(rename = "serverError", skip_serializing_if = "Option::is_none")]
    pub server_error: Option<String>,
}

#[derive(Serialize)]
pub struct PortUpdateResult {
    pub success: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct McpPaths {
    #[serde(rename = "claudeConfigPath")]
    pub claude_config_path: String,
    #[serde(rename = "mcpServerPath")]
    pub mcp_server_path: String,
}

#[tauri::command]
pub async fn mcp_start_server(app: AppHandle) -> AppResult<McpConfigResult> {
    match http_server::start(app).await {
        Ok(port) => Ok(McpConfigResult {
            success: true,
            message: format!("MCP HTTP 服务器已启动（端口: {port}）"),
            needs_restart: false,
        }),
        Err(e) => Ok(McpConfigResult {
            success: false,
            message: if e.contains("已被占用") {
                format!("端口被占用: {e}。请修改端口后重试。")
            } else {
                format!("启动失败: {e}")
            },
            needs_restart: false,
        }),
    }
}

#[tauri::command]
pub async fn mcp_configure_claude(app: AppHandle, mcp: State<'_, McpState>) -> AppResult<McpConfigResult> {
    // 确保 HTTP 桥在运行
    if !mcp.running.load(Ordering::SeqCst) {
        if let Err(e) = http_server::start(app.clone()).await {
            return Ok(McpConfigResult {
                success: false,
                message: format!("HTTP 服务启动失败: {e}。请检查端口设置。"),
                needs_restart: false,
            });
        }
    }
    let port = mcp.port.load(Ordering::SeqCst);
    match claude_config::configure(port) {
        Ok(()) => Ok(McpConfigResult {
            success: true,
            message: format!("Claude Desktop 配置已写入（端口: {port}），请重启 Claude Desktop"),
            needs_restart: true,
        }),
        Err(e) => Ok(McpConfigResult {
            success: false,
            message: format!("配置失败: {e}"),
            needs_restart: false,
        }),
    }
}

#[tauri::command]
pub async fn mcp_get_status(mcp: State<'_, McpState>) -> AppResult<McpStatus> {
    Ok(McpStatus {
        configured: claude_config::is_configured(),
        server_running: mcp.running.load(Ordering::SeqCst),
        port: if mcp.running.load(Ordering::SeqCst) {
            mcp.port.load(Ordering::SeqCst)
        } else {
            mcp::read_configured_port()
        },
        server_error: None,
    })
}

#[tauri::command]
pub async fn mcp_get_http_config() -> AppResult<serde_json::Value> {
    Ok(serde_json::json!({ "port": mcp::read_configured_port() }))
}

#[tauri::command]
pub async fn mcp_update_port(
    app: AppHandle,
    mcp: State<'_, McpState>,
    port: u16,
) -> AppResult<PortUpdateResult> {
    if let Err(e) = mcp::save_configured_port(port) {
        return Ok(PortUpdateResult { success: false, message: format!("更新端口失败: {e}") });
    }
    if mcp.running.load(Ordering::SeqCst) {
        match http_server::restart(app).await {
            Ok(_) => Ok(PortUpdateResult {
                success: true,
                message: format!("端口已更新为 {port}，服务器已重启"),
            }),
            Err(e) => Ok(PortUpdateResult {
                success: false,
                message: format!("端口已保存，但重启失败: {e}"),
            }),
        }
    } else {
        Ok(PortUpdateResult {
            success: true,
            message: format!("端口已更新为 {port}，下次启动时生效"),
        })
    }
}

#[tauri::command]
pub async fn mcp_get_paths() -> AppResult<McpPaths> {
    Ok(McpPaths {
        claude_config_path: claude_config::claude_config_path()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        mcp_server_path: claude_config::mcp_server_path()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
    })
}

// ---------- 导入确认（渲染层 MCPImport 页面）----------

#[tauri::command]
pub async fn mcp_import_get_data(mcp: State<'_, McpState>) -> AppResult<Option<McpImportRequest>> {
    Ok(mcp.pending_import.lock().unwrap().clone())
}

#[tauri::command]
pub async fn mcp_import_clear_data(mcp: State<'_, McpState>) -> AppResult<serde_json::Value> {
    *mcp.pending_import.lock().unwrap() = None;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn mcp_import_confirm(
    db: State<'_, Db>,
    cache: State<'_, ForecastCache>,
    transactions: Vec<CreateTransactionDTO>,
) -> AppResult<serde_json::Value> {
    let result = db::with_db(&db, |conn| transaction::batch_create(conn, &transactions));
    match result {
        Ok(()) => {
            cache.invalidate();
            Ok(serde_json::json!({ "success": true, "count": transactions.len() }))
        }
        Err(e) => Ok(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

pub mod claude_config;
pub mod http_server;

use std::sync::atomic::{AtomicBool, AtomicU16};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const DEFAULT_PORT: u16 = 9615;

/// 待用户确认的 MCP 导入请求（send_transactions 推来的数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpImportRequest {
    pub transactions: Vec<serde_json::Value>,
    pub source: String,
}

/// MCP HTTP 桥的运行态
pub struct McpState {
    pub running: AtomicBool,
    pub port: AtomicU16,
    pub pending_import: Mutex<Option<McpImportRequest>>,
    pub shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl Default for McpState {
    fn default() -> Self {
        McpState {
            running: AtomicBool::new(false),
            port: AtomicU16::new(DEFAULT_PORT),
            pending_import: Mutex::new(None),
            shutdown: Mutex::new(None),
        }
    }
}

/// mcp-config.json 端口读写
pub fn read_configured_port() -> u16 {
    let path = crate::paths::data_dir().join("mcp-config.json");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("port").and_then(|p| p.as_u64()))
        .filter(|p| *p > 1024 && *p <= 65535)
        .map(|p| p as u16)
        .unwrap_or(DEFAULT_PORT)
}

pub fn save_configured_port(port: u16) -> Result<(), String> {
    if port <= 1024 {
        return Err("端口号必须是 1025-65535 之间的整数".to_string());
    }
    let path = crate::paths::data_dir().join("mcp-config.json");
    std::fs::write(path, serde_json::json!({ "port": port }).to_string())
        .map_err(|e| e.to_string())
}

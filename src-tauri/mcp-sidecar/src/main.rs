//! Moneta MCP Server（Rust sidecar）
//!
//! 由 Claude Desktop 经 stdio 拉起，三个工具通过 HTTP 转发到
//! Moneta 主应用的 127.0.0.1:<MONETA_MCP_PORT>（默认 9615）。
//!
//! 启动：moneta-mcp --mcp

mod http_client;
mod server;

use rmcp::ServiceExt;

#[tokio::main]
async fn main() {
    let is_mcp_mode = std::env::args().any(|a| a == "--mcp");
    if !is_mcp_mode {
        eprintln!("Usage: moneta-mcp --mcp");
        eprintln!();
        eprintln!("This is the MCP server for Moneta.");
        eprintln!("It should be started by Claude Desktop via stdio.");
        std::process::exit(1);
    }

    // stdout 用于 MCP 通信，日志走 stderr
    eprintln!("Moneta MCP Server started");

    let service = match server::MonetaServer::new()
        .serve(rmcp::transport::stdio())
        .await
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Fatal error: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = service.waiting().await {
        eprintln!("Server error: {e}");
        std::process::exit(1);
    }
}

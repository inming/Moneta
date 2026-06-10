//! 写入 Claude Desktop 的 claude_desktop_config.json，使其经 stdio 拉起
//! 同目录下的 moneta-mcp sidecar 二进制（不依赖系统 Node）。

use std::path::PathBuf;

use serde_json::json;

pub fn claude_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("无法定位用户主目录")?;
    if cfg!(target_os = "macos") {
        Ok(home
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json"))
    } else if cfg!(target_os = "windows") {
        let base = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join("AppData").join("Roaming"));
        Ok(base.join("Claude").join("claude_desktop_config.json"))
    } else {
        Err("不支持的平台".to_string())
    }
}

/// sidecar 二进制路径：与主程序同目录（Tauri externalBin 落点）。
/// 开发模式回退到 target/debug。
pub fn mcp_server_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("无法定位可执行文件目录")?;
    let bin_name = if cfg!(target_os = "windows") { "moneta-mcp.exe" } else { "moneta-mcp" };
    let candidate = dir.join(bin_name);
    if candidate.exists() {
        return Ok(candidate);
    }
    // dev 回退
    let dev = dir.join(bin_name);
    Ok(dev)
}

pub fn is_configured() -> bool {
    claude_config_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("mcpServers").and_then(|m| m.get("moneta").cloned()))
        .is_some()
}

/// 把 moneta sidecar 写入 Claude Desktop 配置（保留其他 server）
pub fn configure(port: u16) -> Result<(), String> {
    let config_path = claude_config_path()?;
    let server_path = mcp_server_path()?;

    let mut config: serde_json::Value = std::fs::read_to_string(&config_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));

    if !config.is_object() {
        config = json!({});
    }
    let obj = config.as_object_mut().unwrap();
    let servers = obj
        .entry("mcpServers")
        .or_insert_with(|| json!({}));
    if !servers.is_object() {
        *servers = json!({});
    }
    servers.as_object_mut().unwrap().insert(
        "moneta".to_string(),
        json!({
            "command": server_path.to_string_lossy(),
            "args": ["--mcp"],
            "env": { "MONETA_MCP_PORT": port.to_string() }
        }),
    );

    if let Some(dir) = config_path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(())
}

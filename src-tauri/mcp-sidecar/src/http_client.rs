//! 与 Moneta 主应用 HTTP 桥（127.0.0.1:<MONETA_MCP_PORT>）的客户端

use std::time::Duration;

pub fn port() -> u16 {
    std::env::var("MONETA_MCP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9615)
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("reqwest client")
}

fn map_err(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "连接 Moneta 主应用超时".to_string()
    } else {
        format!("无法连接到 Moneta 主应用: {e}")
    }
}

pub async fn get_json(path: &str, query: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}{}", port(), path);
    let resp = client().get(&url).query(query).send().await.map_err(map_err)?;
    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(map_err)?;
    if status.is_success() {
        Ok(body)
    } else {
        Err(body
            .get("error")
            .and_then(|e| e.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("HTTP {status}")))
    }
}

pub async fn post_json(path: &str, body: &serde_json::Value) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}{}", port(), path);
    let resp = client().post(&url).json(body).send().await.map_err(map_err)?;
    let status = resp.status();
    let text = resp.text().await.map_err(map_err)?;
    if status.is_success() {
        Ok(serde_json::from_str(&text).unwrap_or(serde_json::Value::Null))
    } else {
        Err(format!("主应用返回错误: {status} {text}"))
    }
}

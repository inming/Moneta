//! MCP HTTP 桥（axum，绑定 127.0.0.1:<port>）。
//! 复刻旧 mcp-http-server.ts 的三个端点：
//! - POST /mcp-import         接收 send_transactions，存待确认请求并通知渲染层
//! - GET  /api/categories     查询启用分类（可选 ?type=）
//! - GET  /api/operators      查询操作人

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tower_http::cors::CorsLayer;

use crate::db::Db;
use crate::mcp::{McpImportRequest, McpState};

#[derive(Clone)]
struct BridgeState {
    app: AppHandle,
}

fn emit_http_status(app: &AppHandle, running: bool, port: u16, error: Option<String>) {
    let _ = app.emit(
        "mcp:http-status-changed",
        json!({ "running": running, "port": port, "error": error }),
    );
}

/// 启动 HTTP 桥（端口取自 mcp-config.json）。绑定失败返回错误信息。
pub async fn start(app: AppHandle) -> Result<u16, String> {
    let mcp = app.state::<McpState>();
    if mcp.running.load(Ordering::SeqCst) {
        return Ok(mcp.port.load(Ordering::SeqCst));
    }

    let port = crate::mcp::read_configured_port();
    let bridge = BridgeState { app: app.clone() };
    let router = Router::new()
        .route("/mcp-import", post(handle_import))
        .route("/api/categories", get(handle_categories))
        .route("/api/operators", get(handle_operators))
        .layer(CorsLayer::permissive())
        .with_state(Arc::new(bridge));

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| {
            let msg = if e.kind() == std::io::ErrorKind::AddrInUse {
                format!("端口 {port} 已被占用")
            } else {
                e.to_string()
            };
            emit_http_status(&app, false, port, Some(msg.clone()));
            msg
        })?;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *mcp.shutdown.lock().unwrap() = Some(tx);
    mcp.running.store(true, Ordering::SeqCst);
    mcp.port.store(port, Ordering::SeqCst);
    emit_http_status(&app, true, port, None);

    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async {
            let _ = rx.await;
        });
        if let Err(e) = server.await {
            log::error!("mcp http server error: {e}");
        }
        let mcp = app_for_task.state::<McpState>();
        mcp.running.store(false, Ordering::SeqCst);
        emit_http_status(&app_for_task, false, port, None);
    });

    Ok(port)
}

pub fn stop(app: &AppHandle) {
    let mcp = app.state::<McpState>();
    if let Some(tx) = mcp.shutdown.lock().unwrap().take() {
        let _ = tx.send(());
    }
    mcp.running.store(false, Ordering::SeqCst);
}

pub async fn restart(app: AppHandle) -> Result<u16, String> {
    stop(&app);
    // 给 graceful shutdown 一点时间释放端口
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    start(app).await
}

async fn handle_import(
    State(state): State<Arc<BridgeState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let transactions = payload.get("transactions").and_then(|t| t.as_array()).cloned();
    let source = payload.get("source").and_then(|s| s.as_str()).map(String::from);

    let (Some(transactions), Some(source)) = (transactions, source) else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid request data" })));
    };

    let request = McpImportRequest { transactions, source };
    let mcp = state.app.state::<McpState>();
    *mcp.pending_import.lock().unwrap() = Some(request);

    let _ = state.app.emit("mcp:import-open", ());
    (StatusCode::OK, Json(json!({ "success": true })))
}

async fn handle_categories(
    State(state): State<Arc<BridgeState>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let db = state.app.state::<Db>();
    let type_filter = params.get("type").cloned();
    let result = crate::db::with_db(&db, |conn| {
        let mut sql = String::from(
            "SELECT id, name, type, description, sort_order FROM categories WHERE is_active = 1",
        );
        let mut args: Vec<rusqlite::types::Value> = Vec::new();
        if let Some(t) = &type_filter {
            sql.push_str(" AND type = ?");
            args.push(rusqlite::types::Value::Text(t.clone()));
        }
        sql.push_str(" ORDER BY type, sort_order");

        let mut stmt = conn.prepare(&sql).map_err(|e| crate::error::AppError::Db(e.to_string()))?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(args.iter()), |row| {
                Ok(json!({
                    "id": row.get::<_, i64>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "type": row.get::<_, String>(2)?,
                    "description": row.get::<_, String>(3)?,
                    "sort_order": row.get::<_, i64>(4)?,
                }))
            })
            .map_err(|e| crate::error::AppError::Db(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| crate::error::AppError::Db(e.to_string()))?;
        Ok(rows)
    });

    match result {
        Ok(rows) => (StatusCode::OK, Json(json!(rows))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

async fn handle_operators(State(state): State<Arc<BridgeState>>) -> impl IntoResponse {
    let db = state.app.state::<Db>();
    let result = crate::db::with_db(&db, |conn| {
        let mut stmt = conn
            .prepare("SELECT id, name FROM operators ORDER BY name")
            .map_err(|e| crate::error::AppError::Db(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(json!({ "id": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)? }))
            })
            .map_err(|e| crate::error::AppError::Db(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| crate::error::AppError::Db(e.to_string()))?;
        Ok(rows)
    });

    match result {
        Ok(rows) => (StatusCode::OK, Json(json!(rows))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

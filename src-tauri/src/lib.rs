mod commands;
mod config;
mod db;
mod error;
mod mcp;
mod models;
mod paths;
mod secrets;
mod services;
mod state;
mod sync;

use secrets::migrate::BootstrapStatus;
use state::Bootstrap;
use tauri::Manager;

/// 首启秘密迁移时的"真实开库验证"钩子
pub(crate) fn db_key_validator() -> Option<secrets::migrate::DbKeyValidator> {
    Some(db::validate_db_key)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Bootstrap::default())
        .manage(db::Db::default())
        .manage(services::forecast::ForecastCache::default())
        .manage(commands::io::AllowedPaths::default())
        .manage(mcp::McpState::default())
        .manage(sync::SyncState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            // 异步执行首启迁移 + 开库：keychain 授权弹窗不阻塞窗口创建，
            // 渲染层经 app_bootstrap_status 轮询等待
            tauri::async_runtime::spawn(async move {
                let init_handle = handle.clone();
                let status = match tauri::async_runtime::spawn_blocking(move || {
                    secrets::migrate::ensure_secrets_migrated(db_key_validator())
                        .map_err(|e| format!("数据迁移失败：{e}"))?;
                    db::init_database(&init_handle.state::<db::Db>())
                        .map_err(|e| format!("数据库初始化失败：{e}"))
                })
                .await
                {
                    Ok(Ok(())) => BootstrapStatus::ready(),
                    Ok(Err(e)) => {
                        log::error!("bootstrap failed: {e}");
                        BootstrapStatus::error(e)
                    }
                    Err(e) => BootstrapStatus::error(format!("bootstrap task panicked: {e}")),
                };
                let ready = status.state == "ready";
                *handle.state::<Bootstrap>().0.lock().unwrap() = status;

                if ready {
                    // 数据库就绪后自动拉起 MCP HTTP 桥（与旧版启动即开一致）
                    if let Err(e) = mcp::http_server::start(handle.clone()).await {
                        log::warn!("mcp http server failed to start: {e}");
                    }
                    // 启动定时自动同步
                    sync::scheduler::restart_auto_sync(&handle);
                    // 启动 2s 后做一次自动同步（与旧版一致）
                    let sync_handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        if sync::store::should_auto_sync() && !sync::engine::is_running(&sync_handle) {
                            let _ = sync::engine::sync_now(&sync_handle).await;
                        }
                    });
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_bootstrap_status,
            commands::app::app_retry_migration,
            commands::app::i18n_get_language,
            commands::app::i18n_set_language,
            commands::app::theme_get,
            commands::app::theme_set,
            commands::auth::auth_has_pin,
            commands::auth::auth_set_pin,
            commands::auth::auth_verify_pin,
            commands::auth::auth_change_pin,
            commands::auth::auth_get_auto_lock,
            commands::auth::auth_set_auto_lock,
            commands::data::transaction_list,
            commands::data::transaction_create,
            commands::data::transaction_update,
            commands::data::transaction_delete,
            commands::data::transaction_batch_create,
            commands::data::transaction_batch_delete,
            commands::data::category_list,
            commands::data::category_list_all,
            commands::data::category_create,
            commands::data::category_update,
            commands::data::category_delete,
            commands::data::category_reorder,
            commands::data::operator_list,
            commands::data::operator_create,
            commands::data::operator_update,
            commands::data::operator_delete,
            commands::data::stats_cross_table,
            commands::data::stats_summary,
            commands::data::stats_year_range,
            commands::data::stats_yearly_category,
            commands::data::stats_forecast,
            commands::data::draft_get,
            commands::data::draft_save,
            commands::data::draft_delete,
            commands::data::draft_get_summary,
            commands::data::data_clear_transactions,
            commands::data::data_factory_reset,
            commands::data::export_count,
            commands::data::export_query,
            commands::io::dialog_open_file,
            commands::io::dialog_save_file,
            commands::io::file_read,
            commands::io::file_write,
            commands::io::import_execute,
            commands::mcp::mcp_start_server,
            commands::mcp::mcp_configure_claude,
            commands::mcp::mcp_get_status,
            commands::mcp::mcp_get_http_config,
            commands::mcp::mcp_update_port,
            commands::mcp::mcp_get_paths,
            commands::mcp::mcp_import_get_data,
            commands::mcp::mcp_import_clear_data,
            commands::mcp::mcp_import_confirm,
            commands::sync::sync_config_get,
            commands::sync::sync_config_set,
            commands::sync::sync_credentials_set,
            commands::sync::sync_credentials_clear,
            commands::sync::sync_test,
            commands::sync::sync_now,
            commands::sync::sync_status,
            commands::sync::sync_resolve_conflict,
            commands::sync::sync_inspect,
            commands::sync::sync_setup_initial,
            commands::sync::sync_setup_join,
            commands::sync::sync_setup_adopt_local,
            commands::sync::sync_change_passphrase,
            commands::sync::sync_reset_cloud,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(handle_run_event);
}

use std::sync::atomic::{AtomicBool, Ordering};

static IS_QUITTING: AtomicBool = AtomicBool::new(false);

/// 退出前最后一次同步（5s 超时），复刻旧版 before-quit 语义
fn handle_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested { api, .. } = event {
        if IS_QUITTING.load(Ordering::SeqCst) {
            return;
        }
        let running = sync::engine::is_running(app);
        if !running && !sync::store::should_auto_sync() {
            return;
        }
        // 拦截退出，后台跑完同步再真正退出
        api.prevent_exit();
        IS_QUITTING.store(true, Ordering::SeqCst);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let task = async {
                if sync::engine::is_running(&app) {
                    sync::engine::wait_for_idle(&app, 5000).await;
                } else if sync::store::should_auto_sync() {
                    let _ = sync::engine::sync_now(&app).await;
                }
            };
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), task).await;
            app.exit(0);
        });
    }
}

#[cfg(test)]
pub(crate) mod test_util {
    use std::sync::{Mutex, MutexGuard};

    /// 串行化所有改 MONETA_DATA_DIR / mock keyring 的测试
    pub static ENV_LOCK: Mutex<()> = Mutex::new(());

    pub fn isolated_env() -> (MutexGuard<'static, ()>, tempfile::TempDir) {
        let guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("MONETA_DATA_DIR", dir.path());
        std::env::set_var("MONETA_KEYRING", "mock");
        crate::secrets::reset_mock_store();
        (guard, dir)
    }
}

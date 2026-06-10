//! 定时自动同步（tokio interval task，存 AbortHandle 于 SyncState）。

use tauri::{AppHandle, Manager};

use crate::sync::{engine, store, SyncState};

/// 根据配置的间隔（分钟）重启定时器。0 表示关闭。
pub fn restart_auto_sync(app: &AppHandle) {
    let state = app.state::<SyncState>();
    if let Some(handle) = state.scheduler.lock().unwrap().take() {
        handle.abort();
    }

    let minutes = store::current_block().auto_sync_interval_minutes.unwrap_or(0);
    if minutes <= 0 {
        return;
    }

    let app_for_task = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs((minutes as u64) * 60));
        interval.tick().await; // 跳过立即触发的首 tick
        loop {
            interval.tick().await;
            let block = store::current_block();
            if !block.enabled {
                continue;
            }
            if store::get_decrypted_credentials().ok().flatten().is_none() {
                continue;
            }
            if engine::is_running(&app_for_task) {
                continue;
            }
            let _ = engine::sync_now(&app_for_task).await;
        }
    });
    *app.state::<SyncState>().scheduler.lock().unwrap() = Some(task);
}

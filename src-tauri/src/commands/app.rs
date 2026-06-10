use tauri::State;

use crate::config;
use crate::error::AppResult;
use crate::secrets::migrate::{self, BootstrapStatus};
use crate::services::locale;
use crate::state::Bootstrap;

#[tauri::command]
pub async fn app_bootstrap_status(bootstrap: State<'_, Bootstrap>) -> AppResult<BootstrapStatus> {
    Ok(bootstrap.0.lock().unwrap().clone())
}

/// 重试首启秘密迁移（如用户在钥匙串弹窗点了拒绝后再试）
#[tauri::command]
pub async fn app_retry_migration(
    bootstrap: State<'_, Bootstrap>,
    db: State<'_, crate::db::Db>,
) -> AppResult<BootstrapStatus> {
    let result = migrate::ensure_secrets_migrated(crate::db_key_validator())
        .map_err(|e| format!("数据迁移失败：{e}"))
        .and_then(|_| {
            crate::db::init_database(&db).map_err(|e| format!("数据库初始化失败：{e}"))
        });
    let status = match result {
        Ok(()) => BootstrapStatus::ready(),
        Err(e) => BootstrapStatus::error(e),
    };
    *bootstrap.0.lock().unwrap() = status.clone();
    Ok(status)
}

#[tauri::command]
pub async fn i18n_get_language() -> AppResult<String> {
    Ok(config::load_config()
        .language
        .unwrap_or_else(locale::detect_system_language))
}

#[tauri::command]
pub async fn i18n_set_language(language: String) -> AppResult<String> {
    let mut cfg = config::load_config();
    cfg.language = Some(language.clone());
    config::save_config(&cfg);
    Ok(language)
}

#[tauri::command]
pub async fn theme_get() -> AppResult<String> {
    Ok(config::load_config().theme.unwrap_or_else(|| "system".into()))
}

#[tauri::command]
pub async fn theme_set(mode: String) -> AppResult<()> {
    let mut cfg = config::load_config();
    cfg.theme = Some(mode);
    config::save_config(&cfg);
    Ok(())
}

use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppResult;
use crate::sync::{
    engine, scheduler, store, SaveSyncConfigDTO, SetCredentialsDTO, SetupSyncDTO, SyncCloudInspect,
    SyncConfigPublic, SyncRunResult, SyncStatus, SyncTestResult,
};

#[derive(Serialize)]
pub struct SyncConfigGetResult {
    pub config: SyncConfigPublic,
    #[serde(rename = "safeStorageAvailable")]
    pub safe_storage_available: bool,
}

#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Serialize)]
pub struct ChangePassphraseResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct ResetResult {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub async fn sync_config_get() -> AppResult<SyncConfigGetResult> {
    // OS keyring 始终可用（不依赖 Electron safeStorage），保持字段以兼容前端
    Ok(SyncConfigGetResult { config: store::get_sync_config(), safe_storage_available: true })
}

#[tauri::command]
pub async fn sync_config_set(app: AppHandle, dto: SaveSyncConfigDTO) -> AppResult<SyncConfigPublic> {
    let result = store::save_sync_config(&dto);
    scheduler::restart_auto_sync(&app);
    Ok(result)
}

#[tauri::command]
pub async fn sync_credentials_set(app: AppHandle, dto: SetCredentialsDTO) -> AppResult<OkResult> {
    store::set_credentials(&dto.access_key_id, &dto.secret_access_key)?;
    scheduler::restart_auto_sync(&app);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn sync_credentials_clear(app: AppHandle) -> AppResult<OkResult> {
    store::clear_credentials()?;
    scheduler::restart_auto_sync(&app);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub async fn sync_test(app: AppHandle) -> AppResult<SyncTestResult> {
    Ok(engine::test_connection(&app).await)
}

#[tauri::command]
pub async fn sync_now(app: AppHandle) -> AppResult<SyncRunResult> {
    Ok(engine::sync_now(&app).await)
}

#[tauri::command]
pub async fn sync_status(app: AppHandle) -> AppResult<SyncStatus> {
    Ok(engine::get_status(&app))
}

#[tauri::command]
pub async fn sync_resolve_conflict(app: AppHandle, resolution: String) -> AppResult<SyncRunResult> {
    Ok(engine::resolve_conflict(&app, &resolution).await)
}

#[tauri::command]
pub async fn sync_inspect(app: AppHandle) -> AppResult<SyncCloudInspect> {
    engine::inspect_cloud(&app).await.map_err(crate::error::AppError::msg)
}

#[tauri::command]
pub async fn sync_setup_initial(app: AppHandle, dto: SetupSyncDTO) -> AppResult<SyncRunResult> {
    let result = engine::setup_initial(&app, &dto.passphrase).await;
    scheduler::restart_auto_sync(&app);
    Ok(result)
}

#[tauri::command]
pub async fn sync_setup_join(app: AppHandle, dto: SetupSyncDTO) -> AppResult<SyncRunResult> {
    let result = engine::setup_join(&app, &dto.passphrase).await;
    scheduler::restart_auto_sync(&app);
    Ok(result)
}

#[tauri::command]
pub async fn sync_setup_adopt_local(app: AppHandle, dto: SetupSyncDTO) -> AppResult<SyncRunResult> {
    let result = engine::setup_adopt_local(&app, &dto.passphrase).await;
    scheduler::restart_auto_sync(&app);
    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct ChangePassphraseDTO {
    #[serde(rename = "oldPassphrase")]
    pub old_passphrase: String,
    #[serde(rename = "newPassphrase")]
    pub new_passphrase: String,
}

#[tauri::command]
pub async fn sync_change_passphrase(
    app: AppHandle,
    dto: ChangePassphraseDTO,
) -> AppResult<ChangePassphraseResult> {
    let r = engine::change_passphrase(&app, &dto.old_passphrase, &dto.new_passphrase).await;
    Ok(ChangePassphraseResult { ok: r.ok, message: r.message, error: r.error })
}

#[tauri::command]
pub async fn sync_reset_cloud(app: AppHandle) -> AppResult<ResetResult> {
    let r = engine::reset_cloud(&app).await;
    scheduler::restart_auto_sync(&app);
    Ok(ResetResult { ok: r.ok, message: r.message })
}

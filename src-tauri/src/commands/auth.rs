use crate::error::AppResult;
use crate::services::pin::{self, ChangePinResult, VerifyPinResult};

#[tauri::command]
pub async fn auth_has_pin() -> AppResult<bool> {
    pin::has_pin()
}

#[tauri::command]
pub async fn auth_set_pin(pin: String) -> AppResult<()> {
    pin::set_pin(&pin)
}

#[tauri::command]
pub async fn auth_verify_pin(pin: String) -> AppResult<VerifyPinResult> {
    pin::verify_pin(&pin)
}

#[tauri::command]
pub async fn auth_change_pin(current_pin: String, new_pin: String) -> AppResult<ChangePinResult> {
    pin::change_pin(&current_pin, &new_pin)
}

#[tauri::command]
pub async fn auth_get_auto_lock() -> AppResult<i64> {
    Ok(pin::get_auto_lock_minutes())
}

#[tauri::command]
pub async fn auth_set_auto_lock(minutes: i64) -> AppResult<()> {
    pin::set_auto_lock_minutes(minutes);
    Ok(())
}

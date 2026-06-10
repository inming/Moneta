pub mod electron_compat;
pub mod migrate;

use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::{AppError, AppResult};

pub const KEYRING_SERVICE: &str = "Moneta";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[allow(clippy::enum_variant_names)]
pub enum SecretKey {
    DbKey,
    Pin,
    S3AccessKey,
    S3SecretKey,
}

impl SecretKey {
    pub fn account(self) -> &'static str {
        match self {
            SecretKey::DbKey => "db-key",
            SecretKey::Pin => "pin",
            SecretKey::S3AccessKey => "s3-access-key",
            SecretKey::S3SecretKey => "s3-secret-key",
        }
    }
}

// 测试/CI 用内存后端（MONETA_KEYRING=mock），避免依赖真实 OS keyring
static MOCK_STORE: Mutex<Option<HashMap<&'static str, String>>> = Mutex::new(None);

fn use_mock() -> bool {
    std::env::var("MONETA_KEYRING").is_ok_and(|v| v == "mock")
}

// 开发调试用明文文件后端（MONETA_KEYRING=file）：秘密存 data_dir/.dev-secrets.json。
// 仅用于开发期对真实数据副本做 E2E（避免未签名二进制反复触发 keychain 弹窗），
// 生产构建严禁使用。
fn use_file() -> bool {
    std::env::var("MONETA_KEYRING").is_ok_and(|v| v == "file")
}

fn file_store_path() -> std::path::PathBuf {
    crate::paths::data_dir().join(".dev-secrets.json")
}

fn file_store_read() -> HashMap<String, String> {
    std::fs::read_to_string(file_store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn file_store_write(map: &HashMap<String, String>) -> AppResult<()> {
    std::fs::write(file_store_path(), serde_json::to_string_pretty(map)?)?;
    Ok(())
}

fn entry(key: SecretKey) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, key.account())
        .map_err(|e| AppError::Keyring(e.to_string()))
}

pub fn get_secret(key: SecretKey) -> AppResult<Option<String>> {
    if use_mock() {
        let store = MOCK_STORE.lock().unwrap();
        return Ok(store.as_ref().and_then(|m| m.get(key.account()).cloned()));
    }
    if use_file() {
        return Ok(file_store_read().get(key.account()).cloned());
    }
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keyring(e.to_string())),
    }
}

pub fn set_secret(key: SecretKey, value: &str) -> AppResult<()> {
    if use_mock() {
        let mut store = MOCK_STORE.lock().unwrap();
        store.get_or_insert_with(HashMap::new).insert(key.account(), value.to_string());
        return Ok(());
    }
    if use_file() {
        let mut map = file_store_read();
        map.insert(key.account().to_string(), value.to_string());
        return file_store_write(&map);
    }
    entry(key)?
        .set_password(value)
        .map_err(|e| AppError::Keyring(e.to_string()))
}

#[cfg(test)]
pub fn reset_mock_store() {
    *MOCK_STORE.lock().unwrap() = None;
}

pub fn delete_secret(key: SecretKey) -> AppResult<()> {
    if use_mock() {
        if let Some(m) = MOCK_STORE.lock().unwrap().as_mut() {
            m.remove(key.account());
        }
        return Ok(());
    }
    if use_file() {
        let mut map = file_store_read();
        map.remove(key.account());
        return file_store_write(&map);
    }
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keyring(e.to_string())),
    }
}

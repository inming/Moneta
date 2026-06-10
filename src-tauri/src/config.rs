use serde::{Deserialize, Serialize};

use crate::paths;

/// config.json 数据模型。字段名与旧 Electron 版完全一致（混合命名，
/// 显式 rename），未知字段经 flatten 原样保留（如历史遗留的 aiProviders）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncCursor {
    #[serde(rename = "manifestVersion", default)]
    pub manifest_version: i64,
    #[serde(rename = "manifestEtag", default)]
    pub manifest_etag: String,
    #[serde(rename = "localSha256", default)]
    pub local_sha256: String,
    #[serde(rename = "syncedAt", default)]
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoredSyncConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(rename = "pathStyle", default)]
    pub path_style: bool,
    #[serde(rename = "s3AccessKeyEncrypted", default)]
    pub s3_access_key_encrypted: String,
    #[serde(rename = "s3SecretKeyEncrypted", default)]
    pub s3_secret_key_encrypted: String,
    #[serde(rename = "deviceId", default)]
    pub device_id: String,
    #[serde(default)]
    pub cursor: Option<SyncCursor>,
    #[serde(rename = "lastSyncAt", default)]
    pub last_sync_at: Option<String>,
    #[serde(rename = "lastSyncError", default)]
    pub last_sync_error: Option<String>,
    #[serde(
        rename = "autoSyncIntervalMinutes",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub auto_sync_interval_minutes: Option<i64>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_auto_lock() -> i64 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(rename = "pinEncrypted", default)]
    pub pin_encrypted: String,
    #[serde(rename = "pinFailCount", default)]
    pub pin_fail_count: i64,
    #[serde(rename = "pinLockedUntil", default)]
    pub pin_locked_until: String,
    #[serde(rename = "autoLockMinutes", default = "default_auto_lock")]
    pub auto_lock_minutes: i64,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(rename = "dbKeyEncrypted", default)]
    pub db_key_encrypted: String,
    #[serde(rename = "dbMigrationState", default, skip_serializing_if = "Option::is_none")]
    pub db_migration_state: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync: Option<StoredSyncConfig>,
    /// "keyring" 表示秘密已从旧 Electron safeStorage 迁入 OS keyring
    #[serde(rename = "secretsBackend", default, skip_serializing_if = "Option::is_none")]
    pub secrets_backend: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            pin_encrypted: String::new(),
            pin_fail_count: 0,
            pin_locked_until: String::new(),
            auto_lock_minutes: 30,
            language: Some(crate::services::locale::detect_system_language()),
            db_key_encrypted: String::new(),
            db_migration_state: None,
            theme: Some("system".into()),
            sync: None,
            secrets_backend: None,
            extra: serde_json::Map::new(),
        }
    }
}

pub fn load_config() -> AppConfig {
    let path = paths::config_path();
    if !path.exists() {
        let config = AppConfig::default();
        save_config(&config);
        return config;
    }
    match std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<AppConfig>(&raw).ok())
    {
        Some(mut config) => {
            if config.language.is_none() {
                config.language = Some(crate::services::locale::detect_system_language());
            }
            if config.theme.is_none() {
                config.theme = Some("system".into());
            }
            config
        }
        None => {
            // 与旧版语义一致：解析失败回退默认配置
            let config = AppConfig::default();
            save_config(&config);
            config
        }
    }
}

pub fn save_config(config: &AppConfig) {
    let path = paths::config_path();
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(path, json);
    }
}

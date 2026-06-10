//! 首启秘密迁移状态机：把旧 Electron config.json 中的 safeStorage 密文
//! 解密后转存 OS keyring，验证通过后才擦除 config 中的密文字段。
//! 任何失败都不落盘、可重试；绝不进入"新建空库"分支。

use serde::Serialize;

use crate::config;
use crate::paths;
use crate::secrets::{self, electron_compat, SecretKey};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapStatus {
    /// pending | ready | error
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl BootstrapStatus {
    pub fn pending() -> Self {
        BootstrapStatus { state: "pending".into(), message: None }
    }
    pub fn ready() -> Self {
        BootstrapStatus { state: "ready".into(), message: None }
    }
    pub fn error(message: impl Into<String>) -> Self {
        BootstrapStatus { state: "error".into(), message: Some(message.into()) }
    }
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn is_salt_hash(s: &str) -> bool {
    match s.split_once(':') {
        Some((salt, hash)) => {
            !salt.is_empty()
                && !hash.is_empty()
                && salt.bytes().all(|b| b.is_ascii_hexdigit())
                && hash.bytes().all(|b| b.is_ascii_hexdigit())
        }
        None => false,
    }
}

/// 数据库密钥有效性校验钩子；db 模块就绪后注入"真实开库验证"。
pub type DbKeyValidator = fn(&str) -> Result<(), String>;

pub fn ensure_secrets_migrated(validate_db_key: Option<DbKeyValidator>) -> Result<(), String> {
    let mut cfg = config::load_config();

    if cfg.secrets_backend.as_deref() == Some("keyring") {
        return Ok(());
    }

    let sync_ak = cfg.sync.as_ref().map(|s| s.s3_access_key_encrypted.clone()).unwrap_or_default();
    let sync_sk = cfg.sync.as_ref().map(|s| s.s3_secret_key_encrypted.clone()).unwrap_or_default();

    let has_any = !cfg.pin_encrypted.is_empty()
        || !cfg.db_key_encrypted.is_empty()
        || !sync_ak.is_empty()
        || !sync_sk.is_empty();

    if !has_any {
        // 全新安装（或秘密为空），直接标记新后端
        cfg.secrets_backend = Some("keyring".into());
        config::save_config(&cfg);
        return Ok(());
    }

    // 1. 备份原始 config.json（仅一次）
    let bak = paths::data_dir().join("config.json.electron.bak");
    if !bak.exists() {
        std::fs::copy(paths::config_path(), &bak)
            .map_err(|e| format!("备份 config.json 失败: {e}"))?;
    }

    // 2. 解密 + 格式校验
    let db_key = if cfg.db_key_encrypted.is_empty() {
        None
    } else {
        let v = electron_compat::decrypt_string(&cfg.db_key_encrypted)
            .map_err(|e| format!("解密数据库密钥失败：{e}"))?;
        if !is_hex64(&v) {
            return Err("解出的数据库密钥格式不正确（应为 64 位十六进制）".to_string());
        }
        Some(v)
    };

    let pin = if cfg.pin_encrypted.is_empty() {
        None
    } else {
        let v = electron_compat::decrypt_string(&cfg.pin_encrypted)
            .map_err(|e| format!("解密 PIN 失败：{e}"))?;
        if !is_salt_hash(&v) {
            return Err("解出的 PIN 数据格式不正确".to_string());
        }
        Some(v)
    };

    let s3_access = if sync_ak.is_empty() {
        None
    } else {
        Some(electron_compat::decrypt_string(&sync_ak).map_err(|e| format!("解密 S3 AccessKey 失败：{e}"))?)
    };
    let s3_secret = if sync_sk.is_empty() {
        None
    } else {
        Some(electron_compat::decrypt_string(&sync_sk).map_err(|e| format!("解密 S3 SecretKey 失败：{e}"))?)
    };

    // 3. 数据库密钥真实开库验证（db 模块注入）
    if let (Some(key), Some(validator)) = (&db_key, validate_db_key) {
        if paths::db_path().exists() {
            validator(key).map_err(|e| format!("数据库密钥验证失败：{e}"))?;
        }
    }

    // 4. 转存 keyring 并读回校验
    let entries: [(SecretKey, &Option<String>); 4] = [
        (SecretKey::DbKey, &db_key),
        (SecretKey::Pin, &pin),
        (SecretKey::S3AccessKey, &s3_access),
        (SecretKey::S3SecretKey, &s3_secret),
    ];
    for (key, value) in entries {
        if let Some(v) = value {
            secrets::set_secret(key, v).map_err(|e| format!("写入 keyring 失败: {e}"))?;
            let back = secrets::get_secret(key).map_err(|e| format!("回读 keyring 失败: {e}"))?;
            if back.as_deref() != Some(v.as_str()) {
                return Err(format!("keyring 回读校验失败（{}）", key.account()));
            }
        }
    }

    // 5. 全部成功后才擦除 config 中的密文并标记新后端
    cfg.pin_encrypted = String::new();
    cfg.db_key_encrypted = String::new();
    if let Some(sync) = cfg.sync.as_mut() {
        sync.s3_access_key_encrypted = String::new();
        sync.s3_secret_key_encrypted = String::new();
    }
    cfg.secrets_backend = Some("keyring".into());
    config::save_config(&cfg);

    log::info!("secrets migrated from Electron safeStorage to OS keyring");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::isolated_env;
    use base64::Engine;

    #[test]
    fn hex64_check() {
        assert!(is_hex64(&"a".repeat(64)));
        assert!(!is_hex64(&"A".repeat(64)));
        assert!(!is_hex64("abc"));
    }

    #[test]
    fn salt_hash_check() {
        assert!(is_salt_hash("deadbeef:cafebabe"));
        assert!(!is_salt_hash("no-colon"));
        assert!(!is_salt_hash(":missing"));
    }

    fn b64(s: &str) -> String {
        base64::engine::general_purpose::STANDARD.encode(s)
    }

    #[test]
    fn fresh_install_marks_backend() {
        let (_guard, _dir) = isolated_env();
        ensure_secrets_migrated(None).unwrap();
        let cfg = config::load_config();
        assert_eq!(cfg.secrets_backend.as_deref(), Some("keyring"));
    }

    #[test]
    fn legacy_base64_secrets_migrate_to_keyring() {
        let (_guard, _dir) = isolated_env();
        // 构造旧版 legacy（safeStorage 不可用时的纯 base64）config
        let db_key = "f".repeat(64);
        let pin_value = "deadbeef:cafebabe";
        let raw = serde_json::json!({
            "pinEncrypted": b64(pin_value),
            "pinFailCount": 2,
            "pinLockedUntil": "",
            "autoLockMinutes": 15,
            "language": "zh-CN",
            "dbKeyEncrypted": b64(&db_key),
            "theme": "dark",
            "aiProviders": [{"id": "legacy-field"}],
            "sync": {
                "enabled": true,
                "provider": "aliyun",
                "endpoint": "https://oss.example.com",
                "region": "cn-hangzhou",
                "bucket": "b",
                "prefix": "p",
                "pathStyle": false,
                "s3AccessKeyEncrypted": b64("AK123"),
                "s3SecretKeyEncrypted": b64("SK456"),
                "deviceId": "dev-1",
                "cursor": null,
                "lastSyncAt": null,
                "lastSyncError": null
            }
        });
        std::fs::write(paths::config_path(), serde_json::to_string_pretty(&raw).unwrap()).unwrap();

        ensure_secrets_migrated(None).unwrap();

        // keyring 应有 4 条
        assert_eq!(secrets::get_secret(SecretKey::DbKey).unwrap().as_deref(), Some(db_key.as_str()));
        assert_eq!(secrets::get_secret(SecretKey::Pin).unwrap().as_deref(), Some(pin_value));
        assert_eq!(secrets::get_secret(SecretKey::S3AccessKey).unwrap().as_deref(), Some("AK123"));
        assert_eq!(secrets::get_secret(SecretKey::S3SecretKey).unwrap().as_deref(), Some("SK456"));

        // config 密文清空、标记新后端、非密文字段与未知字段保留
        let cfg = config::load_config();
        assert_eq!(cfg.secrets_backend.as_deref(), Some("keyring"));
        assert!(cfg.pin_encrypted.is_empty());
        assert!(cfg.db_key_encrypted.is_empty());
        assert_eq!(cfg.auto_lock_minutes, 15);
        assert_eq!(cfg.theme.as_deref(), Some("dark"));
        assert!(cfg.extra.contains_key("aiProviders"));
        let sync = cfg.sync.unwrap();
        assert!(sync.s3_access_key_encrypted.is_empty());
        assert_eq!(sync.provider, "aliyun");
        assert_eq!(sync.device_id, "dev-1");

        // 备份存在
        assert!(paths::data_dir().join("config.json.electron.bak").exists());

        // 幂等：再跑一次不报错
        ensure_secrets_migrated(None).unwrap();
    }

    #[test]
    fn invalid_db_key_aborts_without_wiping() {
        let (_guard, _dir) = isolated_env();
        let raw = serde_json::json!({
            "dbKeyEncrypted": b64("not-a-hex-key"),
            "pinEncrypted": "",
        });
        std::fs::write(paths::config_path(), serde_json::to_string_pretty(&raw).unwrap()).unwrap();

        assert!(ensure_secrets_migrated(None).is_err());

        // 失败时密文必须原样保留、不得标记新后端
        let cfg = config::load_config();
        assert!(!cfg.db_key_encrypted.is_empty());
        assert_ne!(cfg.secrets_backend.as_deref(), Some("keyring"));
    }

    #[test]
    fn db_validator_failure_aborts() {
        let (_guard, _dir) = isolated_env();
        let raw = serde_json::json!({ "dbKeyEncrypted": b64(&"a".repeat(64)) });
        std::fs::write(paths::config_path(), serde_json::to_string_pretty(&raw).unwrap()).unwrap();
        // 存在 db 文件时 validator 生效
        std::fs::write(paths::db_path(), b"stub").unwrap();

        fn always_fail(_k: &str) -> Result<(), String> {
            Err("bad key".into())
        }
        let err = ensure_secrets_migrated(Some(always_fail)).unwrap_err();
        assert!(err.contains("数据库密钥验证失败"));
        let cfg = config::load_config();
        assert!(!cfg.db_key_encrypted.is_empty());
    }
}

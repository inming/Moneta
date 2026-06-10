//! 同步配置块（config.json 的 sync 字段）读写 + S3 凭证（OS keyring）。

use crate::config::{self, StoredSyncConfig, SyncCursor};
use crate::error::{AppError, AppResult};
use crate::secrets::{self, SecretKey};
use crate::sync::{S3ConfigPublic, SaveSyncConfigDTO, SyncConfigPublic, SyncCursorPublic};

fn default_device_id() -> String {
    let bytes: [u8; 6] = rand::random();
    format!("dev-{}", hex::encode(bytes))
}

fn ensure_sync_block(cfg: &mut config::AppConfig) -> &mut StoredSyncConfig {
    if cfg.sync.is_none() {
        cfg.sync = Some(StoredSyncConfig {
            enabled: false,
            provider: "aws".into(),
            endpoint: "https://s3.amazonaws.com".into(),
            region: "us-east-1".into(),
            bucket: String::new(),
            prefix: "moneta/".into(),
            path_style: false,
            s3_access_key_encrypted: String::new(),
            s3_secret_key_encrypted: String::new(),
            device_id: default_device_id(),
            cursor: None,
            last_sync_at: None,
            last_sync_error: None,
            auto_sync_interval_minutes: Some(0),
            extra: serde_json::Map::new(),
        });
    }
    cfg.sync.as_mut().unwrap()
}

pub fn get_sync_config() -> SyncConfigPublic {
    let mut cfg = config::load_config();
    let block = ensure_sync_block(&mut cfg).clone();
    config::save_config(&cfg);

    let has_credentials = secrets::get_secret(SecretKey::S3AccessKey)
        .ok()
        .flatten()
        .is_some()
        && secrets::get_secret(SecretKey::S3SecretKey).ok().flatten().is_some();

    SyncConfigPublic {
        enabled: block.enabled,
        s3: S3ConfigPublic {
            provider: block.provider.clone(),
            endpoint: block.endpoint.clone(),
            region: block.region.clone(),
            bucket: block.bucket.clone(),
            prefix: block.prefix.clone(),
            path_style: block.path_style,
        },
        has_credentials,
        device_id: block.device_id.clone(),
        cursor: block.cursor.as_ref().map(|c| SyncCursorPublic {
            manifest_version: c.manifest_version,
            manifest_etag: c.manifest_etag.clone(),
            local_sha256: c.local_sha256.clone(),
            synced_at: c.synced_at.clone(),
        }),
        last_sync_at: block.last_sync_at.clone(),
        last_sync_error: block.last_sync_error.clone(),
        auto_sync_interval_minutes: block.auto_sync_interval_minutes.unwrap_or(0),
    }
}

fn normalize_prefix(prefix: &str) -> String {
    let mut p = prefix.trim().trim_start_matches('/').to_string();
    if !p.is_empty() && !p.ends_with('/') {
        p.push('/');
    }
    p
}

pub fn save_sync_config(dto: &SaveSyncConfigDTO) -> SyncConfigPublic {
    let mut cfg = config::load_config();
    {
        let block = ensure_sync_block(&mut cfg);
        block.provider = dto.provider.clone();
        block.endpoint = dto.endpoint.trim().to_string();
        block.region = dto.region.trim().to_string();
        block.bucket = dto.bucket.trim().to_string();
        block.prefix = normalize_prefix(&dto.prefix);
        block.path_style = dto.path_style;
        block.auto_sync_interval_minutes = Some(dto.auto_sync_interval_minutes.max(0));
        block.enabled = !block.bucket.is_empty() && !block.endpoint.is_empty();
    }
    config::save_config(&cfg);
    get_sync_config()
}

pub fn set_credentials(access_key_id: &str, secret_access_key: &str) -> AppResult<()> {
    if access_key_id.is_empty() || secret_access_key.is_empty() {
        return Err(AppError::msg("凭证不能为空"));
    }
    secrets::set_secret(SecretKey::S3AccessKey, access_key_id)?;
    secrets::set_secret(SecretKey::S3SecretKey, secret_access_key)?;
    Ok(())
}

pub fn clear_credentials() -> AppResult<()> {
    secrets::delete_secret(SecretKey::S3AccessKey)?;
    secrets::delete_secret(SecretKey::S3SecretKey)?;
    Ok(())
}

pub fn get_decrypted_credentials() -> AppResult<Option<(String, String)>> {
    let ak = secrets::get_secret(SecretKey::S3AccessKey)?;
    let sk = secrets::get_secret(SecretKey::S3SecretKey)?;
    match (ak, sk) {
        (Some(a), Some(s)) => Ok(Some((a, s))),
        _ => Ok(None),
    }
}

pub fn set_cursor(cursor: Option<SyncCursor>) {
    let mut cfg = config::load_config();
    ensure_sync_block(&mut cfg).cursor = cursor;
    config::save_config(&cfg);
}

pub fn record_sync_result(success: bool, error: Option<&str>, now_iso: &str) {
    let mut cfg = config::load_config();
    {
        let block = ensure_sync_block(&mut cfg);
        block.last_sync_at = Some(now_iso.to_string());
        block.last_sync_error = if success {
            None
        } else {
            Some(error.unwrap_or("unknown").to_string())
        };
    }
    config::save_config(&cfg);
}

/// 当前 sync 块的副本（引擎内部用）
pub fn current_block() -> StoredSyncConfig {
    let mut cfg = config::load_config();
    let block = ensure_sync_block(&mut cfg).clone();
    config::save_config(&cfg);
    block
}

/// 启动/退出时是否自动同步：已启用 + 有凭证 + 已有 cursor（与旧 shouldAutoSync 一致）
pub fn should_auto_sync() -> bool {
    let block = current_block();
    block.enabled
        && block.cursor.is_some()
        && get_decrypted_credentials().ok().flatten().is_some()
}

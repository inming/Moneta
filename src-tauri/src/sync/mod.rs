pub mod db_package;
pub mod engine;
pub mod key_envelope;
pub mod manifest;
pub mod s3;
pub mod scheduler;
pub mod store;

#[cfg(test)]
mod integration_tests;

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const APP_VERSION: &str = "0.1.0";

// ---------- 对外类型（与 src/shared/types/sync.ts 对齐）----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3ConfigPublic {
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    #[serde(rename = "pathStyle")]
    pub path_style: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncCursorPublic {
    #[serde(rename = "manifestVersion")]
    pub manifest_version: i64,
    #[serde(rename = "manifestEtag")]
    pub manifest_etag: String,
    #[serde(rename = "localSha256")]
    pub local_sha256: String,
    #[serde(rename = "syncedAt")]
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncConfigPublic {
    pub enabled: bool,
    pub s3: S3ConfigPublic,
    #[serde(rename = "hasCredentials")]
    pub has_credentials: bool,
    #[serde(rename = "deviceId")]
    pub device_id: String,
    pub cursor: Option<SyncCursorPublic>,
    #[serde(rename = "lastSyncAt")]
    pub last_sync_at: Option<String>,
    #[serde(rename = "lastSyncError")]
    pub last_sync_error: Option<String>,
    #[serde(rename = "autoSyncIntervalMinutes")]
    pub auto_sync_interval_minutes: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveSyncConfigDTO {
    pub provider: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    #[serde(rename = "pathStyle")]
    pub path_style: bool,
    #[serde(rename = "autoSyncIntervalMinutes")]
    pub auto_sync_interval_minutes: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetCredentialsDTO {
    #[serde(rename = "accessKeyId")]
    pub access_key_id: String,
    #[serde(rename = "secretAccessKey")]
    pub secret_access_key: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncTestResult {
    pub ok: bool,
    pub message: String,
    #[serde(rename = "canRead")]
    pub can_read: bool,
    #[serde(rename = "canWrite")]
    pub can_write: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatus {
    pub phase: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(rename = "lastSyncAt")]
    pub last_sync_at: Option<String>,
    #[serde(rename = "lastSyncError")]
    pub last_sync_error: Option<String>,
}

impl Default for SyncStatus {
    fn default() -> Self {
        SyncStatus {
            phase: "idle".into(),
            message: String::new(),
            progress: None,
            last_sync_at: None,
            last_sync_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteManifest {
    pub version: i64,
    #[serde(rename = "writerDeviceId")]
    pub writer_device_id: String,
    #[serde(rename = "writtenAt")]
    pub written_at: String,
    #[serde(rename = "schemaVersion")]
    pub schema_version: i64,
    pub size: u64,
    pub sha256: String,
    #[serde(rename = "keyFingerprint")]
    pub key_fingerprint: String,
    #[serde(rename = "appVersion")]
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConflictInfo {
    #[serde(rename = "localChangedAt")]
    pub local_changed_at: Option<String>,
    #[serde(rename = "localSha256")]
    pub local_sha256: String,
    pub remote: RemoteManifest,
    #[serde(rename = "remoteEtag")]
    pub remote_etag: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncRunResult {
    pub outcome: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict: Option<ConflictInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SyncRunResult {
    pub fn simple(outcome: &str, message: impl Into<String>) -> Self {
        SyncRunResult { outcome: outcome.into(), message: message.into(), conflict: None, error: None }
    }
    pub fn err(message: impl Into<String>, error: impl Into<String>) -> Self {
        let m = message.into();
        SyncRunResult { outcome: "error".into(), message: m, conflict: None, error: Some(error.into()) }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncCloudInspect {
    #[serde(rename = "hasManifest")]
    pub has_manifest: bool,
    #[serde(rename = "hasKeyEnvelope")]
    pub has_key_envelope: bool,
    #[serde(rename = "envelopeFingerprint")]
    pub envelope_fingerprint: Option<String>,
    #[serde(rename = "localFingerprint")]
    pub local_fingerprint: String,
    #[serde(rename = "fingerprintMatches")]
    pub fingerprint_matches: bool,
    #[serde(rename = "remoteVersion")]
    pub remote_version: Option<i64>,
    #[serde(rename = "remoteWriterDeviceId")]
    pub remote_writer_device_id: Option<String>,
    #[serde(rename = "remoteWrittenAt")]
    pub remote_written_at: Option<String>,
    #[serde(rename = "envelopeCreatedAt")]
    pub envelope_created_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetupSyncDTO {
    pub passphrase: String,
}

// ---------- 运行态（Tauri State）----------

pub struct SyncState {
    pub running: AtomicBool,
    pub status: Mutex<SyncStatus>,
    pub pending_conflict: Mutex<Option<ConflictInfo>>,
    pub scheduler: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Default for SyncState {
    fn default() -> Self {
        SyncState {
            running: AtomicBool::new(false),
            status: Mutex::new(SyncStatus::default()),
            pending_conflict: Mutex::new(None),
            scheduler: Mutex::new(None),
        }
    }
}

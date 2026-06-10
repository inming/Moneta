//! manifest.json：远端版本元数据 + CAS 写入。

use crate::sync::s3::{S3Ctx, S3Error};
use crate::sync::{RemoteManifest, APP_VERSION};

pub const MANIFEST_KEY: &str = "manifest.json";
pub const DB_OBJECT_KEY: &str = "db.sqlite.gz";

pub async fn fetch_manifest(ctx: &S3Ctx) -> Result<Option<(RemoteManifest, String)>, S3Error> {
    match ctx.get_json(MANIFEST_KEY).await? {
        Some((value, etag)) => {
            let manifest: RemoteManifest =
                serde_json::from_value(value).map_err(|e| S3Error::Other(e.to_string()))?;
            Ok(Some((manifest, etag)))
        }
        None => Ok(None),
    }
}

pub struct BuildManifestInput {
    pub previous_version: i64,
    pub device_id: String,
    pub schema_version: i64,
    pub size: u64,
    pub sha256: String,
    pub key_fingerprint: String,
    pub written_at: String,
}

pub fn build_manifest(input: BuildManifestInput) -> RemoteManifest {
    RemoteManifest {
        version: input.previous_version + 1,
        writer_device_id: input.device_id,
        written_at: input.written_at,
        schema_version: input.schema_version,
        size: input.size,
        sha256: input.sha256,
        key_fingerprint: input.key_fingerprint,
        app_version: APP_VERSION.to_string(),
    }
}

/// CAS 写 manifest：有 etag → 条件更新；无 → 仅当不存在时创建
pub async fn commit_manifest(
    ctx: &S3Ctx,
    manifest: &RemoteManifest,
    if_match_etag: Option<&str>,
) -> Result<String, S3Error> {
    let value = serde_json::to_value(manifest).map_err(|e| S3Error::Other(e.to_string()))?;
    match if_match_etag {
        Some(etag) => ctx.put_json_if_match(MANIFEST_KEY, &value, etag).await,
        None => ctx.put_json_if_absent(MANIFEST_KEY, &value).await,
    }
}

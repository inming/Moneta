//! 同步层端到端集成测试（针对真实 MinIO/OSS）。
//!
//! 默认跳过；用环境变量启用：
//!   MONETA_MINIO=1 MINIO_ENDPOINT=http://127.0.0.1:9799 \
//!   MINIO_AK=minioadmin MINIO_SK=minioadmin \
//!   cargo test sync::integration -- --nocapture --test-threads=1
//!
//! 覆盖：S3 CAS 契约 + 完整云端数据往返（打包→上传→信封→另一端 join 拉取→
//! 解信封→安装→用 sqlite3mc 打开验证），这是同步引擎跨设备/跨实现的核心保证。

use aws_sdk_s3::config::{
    BehaviorVersion, Credentials, Region, RequestChecksumCalculation, ResponseChecksumValidation,
};
use aws_sdk_s3::Client;

use crate::config::StoredSyncConfig;
use crate::sync::db_package;
use crate::sync::key_envelope;
use crate::sync::manifest::{self, DB_OBJECT_KEY};

fn minio_env() -> Option<(String, String, String)> {
    if std::env::var("MONETA_MINIO").ok().as_deref() != Some("1") {
        return None;
    }
    Some((
        std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://127.0.0.1:9799".into()),
        std::env::var("MINIO_AK").unwrap_or_else(|_| "minioadmin".into()),
        std::env::var("MINIO_SK").unwrap_or_else(|_| "minioadmin".into()),
    ))
}

fn block(endpoint: &str, bucket: &str) -> StoredSyncConfig {
    StoredSyncConfig {
        enabled: true,
        provider: "custom".into(),
        endpoint: endpoint.into(),
        region: "us-east-1".into(),
        bucket: bucket.into(),
        prefix: "moneta/".into(),
        path_style: true,
        s3_access_key_encrypted: String::new(),
        s3_secret_key_encrypted: String::new(),
        device_id: "dev-test".into(),
        cursor: None,
        last_sync_at: None,
        last_sync_error: None,
        auto_sync_interval_minutes: Some(0),
        extra: serde_json::Map::new(),
    }
}

async fn raw_client(endpoint: &str, ak: &str, sk: &str) -> Client {
    let conf = aws_sdk_s3::config::Builder::new()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new("us-east-1"))
        .credentials_provider(Credentials::new(ak, sk, None, None, "test"))
        .endpoint_url(endpoint)
        .force_path_style(true)
        .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
        .response_checksum_validation(ResponseChecksumValidation::WhenRequired)
        .build();
    Client::from_conf(conf)
}

#[tokio::test]
async fn integration_s3_cas_and_roundtrip() {
    let Some((endpoint, ak, sk)) = minio_env() else {
        eprintln!("MONETA_MINIO != 1, skipping integration_s3_cas_and_roundtrip");
        return;
    };

    let bucket = "moneta-rt";
    let raw = raw_client(&endpoint, &ak, &sk).await;
    let _ = raw.create_bucket().bucket(bucket).send().await;
    // 清空 prefix（前次残留）
    if let Ok(list) = raw.list_objects_v2().bucket(bucket).send().await {
        for o in list.contents() {
            if let Some(k) = o.key() {
                let _ = raw.delete_object().bucket(bucket).key(k).send().await;
            }
        }
    }

    let ctx = crate::sync::s3::build_ctx(&block(&endpoint, bucket), &ak, &sk).await;

    // ---- CAS：put_json_if_absent 首次成功、再次失败 ----
    let v1 = serde_json::json!({"version": 1});
    let etag1 = ctx.put_json_if_absent("manifest.json", &v1).await.expect("first put_if_absent");
    assert!(matches!(
        ctx.put_json_if_absent("manifest.json", &v1).await,
        Err(crate::sync::s3::S3Error::Precondition)
    ));

    // put_json_if_match 正确 etag 成功、过期 etag 冲突
    let v2 = serde_json::json!({"version": 2});
    let etag2 = ctx.put_json_if_match("manifest.json", &v2, &etag1).await.expect("if_match");
    assert!(matches!(
        ctx.put_json_if_match("manifest.json", &v2, &etag1).await,
        Err(crate::sync::s3::S3Error::Precondition)
    ));
    let _ = etag2;

    // get_json 读回
    let (got, _) = ctx.get_json("manifest.json").await.expect("get").expect("present");
    assert_eq!(got["version"], 2);

    // 不存在的 key → None
    assert!(ctx.get_json("nope.json").await.expect("get none").is_none());

    // ---- 完整数据往返 ----
    let dir = tempfile::tempdir().unwrap();
    let key = "ab".repeat(32);
    // 用 sqlite3mc 建一个加密库并写入数据
    let src_db = dir.path().join("device-a.db");
    {
        let conn = crate::db::open_connection(&src_db, &key).unwrap();
        crate::db::migrator::run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO transactions (date, type, amount, category_id, description) VALUES ('2025-06-01','expense',42.5,1,'roundtrip')",
            [],
        )
        .unwrap();
        conn.pragma_update(None, "wal_checkpoint", "TRUNCATE").ok();
    }

    // gzip + sha256
    let gz = dir.path().join("device-a.sqlite.gz");
    {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;
        let mut input = std::fs::File::open(&src_db).unwrap();
        let out = std::fs::File::create(&gz).unwrap();
        let mut enc = GzEncoder::new(out, Compression::fast());
        std::io::copy(&mut input, &mut enc).unwrap();
        enc.flush().unwrap();
        enc.finish().unwrap();
    }
    let size = std::fs::metadata(&gz).unwrap().len();
    let sha = db_package::sha256_file(&gz).unwrap();

    // 上传 db + 信封 + manifest（device A）
    ctx.delete_object("manifest.json").await.ok();
    ctx.upload_file(DB_OBJECT_KEY, &gz, "application/gzip").await.expect("upload db");
    let env = key_envelope::wrap_db_key(&key, "shared-passphrase-1", "2025-06-01T00:00:00.000Z").unwrap();
    let env_value = serde_json::to_value(&env).unwrap();
    ctx.put_json_if_absent(key_envelope::KEYENV_KEY, &env_value).await.expect("put envelope");
    let m = manifest::build_manifest(manifest::BuildManifestInput {
        previous_version: 0,
        device_id: "device-a".into(),
        schema_version: 10,
        size,
        sha256: sha.clone(),
        key_fingerprint: key_envelope::fingerprint(&key),
        written_at: "2025-06-01T00:00:00.000Z".into(),
    });
    manifest::commit_manifest(&ctx, &m, None).await.expect("commit manifest");

    // ---- device B：join 流程（从零拉取）----
    let (remote, _etag) = manifest::fetch_manifest(&ctx).await.unwrap().expect("manifest present");
    assert_eq!(remote.version, 1);
    let (fetched_env_value, _) = ctx.get_json(key_envelope::KEYENV_KEY).await.unwrap().unwrap();
    let fetched_env: key_envelope::KeyEnvelope = serde_json::from_value(fetched_env_value).unwrap();
    let unwrapped_key = key_envelope::unwrap_db_key(&fetched_env, "shared-passphrase-1").unwrap();
    assert_eq!(unwrapped_key, key, "device B unwraps the same SQLCipher key");

    let dl = dir.path().join("device-b.sqlite.gz");
    ctx.download_file(DB_OBJECT_KEY, &dl).await.expect("download db");
    assert_eq!(std::fs::metadata(&dl).unwrap().len(), remote.size, "size matches manifest");
    assert_eq!(db_package::sha256_file(&dl).unwrap(), remote.sha256, "sha256 matches manifest");

    // gunzip → 打开 → 校验数据
    let installed = dir.path().join("device-b.db");
    {
        use flate2::read::GzDecoder;
        let input = std::fs::File::open(&dl).unwrap();
        let mut dec = GzDecoder::new(input);
        let mut out = std::fs::File::create(&installed).unwrap();
        std::io::copy(&mut dec, &mut out).unwrap();
    }
    let conn = crate::db::open_connection(&installed, &unwrapped_key).expect("open downloaded db");
    let (amount, desc): (f64, String) = conn
        .query_row("SELECT amount, description FROM transactions WHERE description='roundtrip'", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .expect("query roundtrip row");
    assert_eq!(amount, 42.5);
    assert_eq!(desc, "roundtrip");

    // 清理
    if let Ok(list) = raw.list_objects_v2().bucket(bucket).send().await {
        for o in list.contents() {
            if let Some(k) = o.key() {
                let _ = raw.delete_object().bucket(bucket).key(k).send().await;
            }
        }
    }
    eprintln!("integration_s3_cas_and_roundtrip: full cloud round-trip OK (device A → B)");
}

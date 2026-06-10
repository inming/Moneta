//! 同步引擎状态机（移植自 syncEngine.ts）。所有写云操作 async。

use std::sync::atomic::Ordering;

use chrono::{SecondsFormat, Utc};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::SyncCursor;
use crate::db::{self, migrator, Db};
use crate::sync::db_package::{self};
use crate::sync::key_envelope::{self, EnvelopeError, KeyEnvelope, KEYENV_KEY};
use crate::sync::manifest::{self, DB_OBJECT_KEY, MANIFEST_KEY};
use crate::sync::s3::{self, S3Ctx, S3Error};
use crate::sync::store;
use crate::sync::{
    ConflictInfo, RemoteManifest, SyncCloudInspect, SyncRunResult, SyncState, SyncStatus,
    SyncTestResult,
};

const BACKUP_RETENTION: usize = 7;
const CAS_RETRY_LIMIT: usize = 3;

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn now_millis() -> i64 {
    Utc::now().timestamp_millis()
}

fn set_status(app: &AppHandle, phase: &str, message: &str) {
    let state = app.state::<SyncState>();
    let block = store::current_block();
    let status = SyncStatus {
        phase: phase.to_string(),
        message: message.to_string(),
        progress: None,
        last_sync_at: block.last_sync_at.clone(),
        last_sync_error: block.last_sync_error.clone(),
    };
    *state.status.lock().unwrap() = status.clone();
    let _ = app.emit("sync:event", status);
}

pub fn get_status(app: &AppHandle) -> SyncStatus {
    let state = app.state::<SyncState>();
    let block = store::current_block();
    let mut status = state.status.lock().unwrap().clone();
    status.last_sync_at = block.last_sync_at;
    status.last_sync_error = block.last_sync_error;
    status
}

pub fn is_running(app: &AppHandle) -> bool {
    app.state::<SyncState>().running.load(Ordering::SeqCst)
}

/// 等待进行中的同步结束，最多 timeout_ms；返回是否在超时内空闲
pub async fn wait_for_idle(app: &AppHandle, timeout_ms: u64) -> bool {
    let state = app.state::<SyncState>();
    let start = std::time::Instant::now();
    while state.running.load(Ordering::SeqCst)
        && start.elapsed() < std::time::Duration::from_millis(timeout_ms)
    {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    !state.running.load(Ordering::SeqCst)
}

/// 构造 S3 客户端上下文（凭证来自 keyring）
async fn ensure_ctx() -> Result<S3Ctx, String> {
    let block = store::current_block();
    if block.bucket.is_empty() || block.endpoint.is_empty() {
        return Err("S3 配置不完整".to_string());
    }
    let (ak, sk) = store::get_decrypted_credentials()
        .map_err(|e| e.to_string())?
        .ok_or("未配置 S3 凭证")?;
    Ok(s3::build_ctx(&block, &ak, &sk).await)
}

fn schema_version(db: &Db) -> i64 {
    db::with_db(db, |conn| Ok(migrator::current_schema_version(conn))).unwrap_or(0)
}

pub async fn test_connection(app: &AppHandle) -> SyncTestResult {
    let ctx = match ensure_ctx().await {
        Ok(c) => c,
        Err(e) => return SyncTestResult { ok: false, message: e, can_read: false, can_write: false },
    };

    if let Err(e) = ctx.list_objects("").await {
        return SyncTestResult {
            ok: false,
            message: format!("读取失败: {e}"),
            can_read: false,
            can_write: false,
        };
    }

    // 探针写入
    let probe_key = format!(".moneta-probe-{}-{}", now_millis(), hex::encode(rand::random::<[u8; 4]>()));
    let tmp = match db_package::tmp_path("probe.bin") {
        Ok(p) => p,
        Err(e) => return SyncTestResult { ok: false, message: e.to_string(), can_read: true, can_write: false },
    };
    let _ = std::fs::write(&tmp, b"moneta-probe");
    let write_res = ctx.upload_file(&probe_key, &tmp, "application/octet-stream").await;
    let _ = std::fs::remove_file(&tmp);
    match write_res {
        Ok(()) => {
            let _ = ctx.delete_object(&probe_key).await;
            let _ = app; // status 不变
            SyncTestResult { ok: true, message: "连接成功".into(), can_read: true, can_write: true }
        }
        Err(e) => SyncTestResult {
            ok: false,
            message: format!("写入失败: {e}"),
            can_read: true,
            can_write: false,
        },
    }
}

/// 顶层 syncNow：单飞 + 状态记录
pub async fn sync_now(app: &AppHandle) -> SyncRunResult {
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return SyncRunResult::err("已有同步任务在进行中", "busy");
    }
    if let Some(info) = state.pending_conflict.lock().unwrap().clone() {
        state.running.store(false, Ordering::SeqCst);
        return SyncRunResult {
            outcome: "conflict".into(),
            message: "存在未处理的冲突".into(),
            conflict: Some(info),
            error: None,
        };
    }

    set_status(app, "preparing", "准备中…");
    let result = run_sync(app).await;
    finalize(app, &result);
    state.running.store(false, Ordering::SeqCst);
    result
}

fn finalize(app: &AppHandle, result: &SyncRunResult) {
    match result.outcome.as_str() {
        "error" => {
            store::record_sync_result(false, result.error.as_deref().or(Some(&result.message)), &now_iso());
            set_status(app, "error", &result.message);
        }
        "conflict" => set_status(app, "conflict", "检测到冲突，请选择处理方式"),
        "needs-setup-initial" | "needs-setup-join" => set_status(app, "idle", &result.message),
        _ => {
            store::record_sync_result(true, None, &now_iso());
            set_status(app, "success", &result.message);
        }
    }
}

async fn run_sync(app: &AppHandle) -> SyncRunResult {
    let ctx = match ensure_ctx().await {
        Ok(c) => c,
        Err(e) => return SyncRunResult::err(e.clone(), e),
    };
    set_status(app, "fetching-manifest", "获取远端版本信息…");

    let remote = match manifest::fetch_manifest(&ctx).await {
        Ok(r) => r,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };
    let envelope = match fetch_key_envelope(&ctx).await {
        Ok(e) => e,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    let block = store::current_block();
    let cursor = block.cursor.clone();
    let local_fp = match db::db_key_fingerprint() {
        Ok(fp) => fp,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    if remote.is_none() && envelope.is_none() {
        return SyncRunResult::simple("needs-setup-initial", "云端为空，请先设置同步口令");
    }
    if remote.is_some() && envelope.is_none() {
        return SyncRunResult::err("云端缺少密钥信封（keyenv.json），请重置云端后重新设置", "missing-keyenv");
    }
    if let Some((env, _)) = &envelope {
        if env.key_fingerprint != local_fp {
            return SyncRunResult::simple("needs-setup-join", "本地密钥与云端不匹配，请输入同步口令以加入云端");
        }
    }
    if envelope.is_some() && remote.is_none() {
        return upload_flow(app, &ctx, None, true).await;
    }

    let Some((remote_manifest, remote_etag)) = remote else {
        return SyncRunResult::err("远端状态异常", "inconsistent-state");
    };

    let db = app.state::<Db>();
    let local_schema = schema_version(&db);
    if remote_manifest.schema_version > local_schema {
        return SyncRunResult::err(
            format!("远端数据使用了更新版本的应用（schema {}），请先升级 Moneta 后再同步", remote_manifest.schema_version),
            "schema-mismatch",
        );
    }

    let local_hash = match db_package::live_db_sha256(&db) {
        Ok(h) => h,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };
    let is_local_dirty = cursor.as_ref().is_none_or(|c| c.local_sha256 != local_hash);

    // Branch B: 版本相同
    if let Some(c) = &cursor {
        if remote_manifest.version == c.manifest_version {
            if is_local_dirty {
                return upload_flow(app, &ctx, Some((remote_manifest, remote_etag)), false).await;
            }
            return SyncRunResult::simple("noop", "已是最新");
        }
    }

    // Branch C: 远端更新
    if cursor.as_ref().is_none_or(|c| remote_manifest.version > c.manifest_version) {
        if is_local_dirty {
            let conflict = ConflictInfo {
                local_changed_at: block.last_sync_at.clone(),
                local_sha256: local_hash,
                remote: remote_manifest,
                remote_etag,
            };
            *app.state::<SyncState>().pending_conflict.lock().unwrap() = Some(conflict.clone());
            return SyncRunResult { outcome: "conflict".into(), message: "检测到冲突".into(), conflict: Some(conflict), error: None };
        }
        return download_flow(app, &ctx, &remote_manifest, &remote_etag, &local_hash).await;
    }

    // Branch D: cursor 超前远端 —— 异常
    SyncRunResult::err("远端版本异常（低于本地已同步版本），请检查 bucket 配置是否被更换", "remote-rolled-back")
}

async fn upload_flow(
    app: &AppHandle,
    ctx: &S3Ctx,
    remote: Option<(RemoteManifest, String)>,
    is_initial: bool,
) -> SyncRunResult {
    set_status(app, "preparing", "打包数据库…");
    let db = app.state::<Db>();
    let block = store::current_block();

    let pkg = match db_package::package_database(&db, now_millis()) {
        Ok(p) => p,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };
    let db_hash = match db_package::live_db_sha256(&db) {
        Ok(h) => h,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };
    let schema = schema_version(&db);
    let key_fp = match db::db_key_fingerprint() {
        Ok(fp) => fp,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    let result = async {
        set_status(app, "uploading", "上传数据库…");
        ctx.upload_file(DB_OBJECT_KEY, &pkg.file_path, "application/gzip").await?;

        if !is_initial {
            // best-effort 归档旧库
            let ts = now_iso().replace([':', '.'], "-");
            let archive_key = format!("backups/db-{ts}.sqlite.gz");
            if let Err(e) = ctx.upload_file(&archive_key, &pkg.file_path, "application/gzip").await {
                log::warn!("[sync] backup archive failed (non-fatal): {e}");
            } else {
                prune_backups(ctx).await;
            }
        }

        set_status(app, "finalizing", "更新版本信息…");
        let mut manifest = manifest::build_manifest(manifest::BuildManifestInput {
            previous_version: remote.as_ref().map(|(m, _)| m.version).unwrap_or(0),
            device_id: block.device_id.clone(),
            schema_version: schema,
            size: pkg.size,
            sha256: pkg.sha256.clone(),
            key_fingerprint: key_fp.clone(),
            written_at: now_iso(),
        });

        let mut attempt = 0;
        let mut manifest_etag = remote.as_ref().map(|(_, e)| e.clone());
        let mut manifest_version = manifest.version;
        let etag = loop {
            match manifest::commit_manifest(ctx, &manifest, manifest_etag.as_deref()).await {
                Ok(etag) => break etag,
                Err(S3Error::Precondition) if attempt < CAS_RETRY_LIMIT => {
                    attempt += 1;
                    match manifest::fetch_manifest(ctx).await? {
                        Some((fresh, fresh_etag)) => {
                            manifest.version = fresh.version + 1;
                            manifest_version = manifest.version;
                            manifest_etag = Some(fresh_etag);
                        }
                        None => {
                            manifest_etag = None;
                        }
                    }
                }
                Err(e) => return Err(e),
            }
        };

        store::set_cursor(Some(SyncCursor {
            manifest_version,
            manifest_etag: etag,
            local_sha256: db_hash.clone(),
            synced_at: now_iso(),
        }));
        Ok::<(), S3Error>(())
    }
    .await;

    db_package::cleanup_tmp(&pkg.file_path);

    match result {
        Ok(()) => SyncRunResult::simple(
            if is_initial { "initial-uploaded" } else { "uploaded" },
            if is_initial { "已首次上传到云端" } else { "已上传到云端" },
        ),
        Err(e) => SyncRunResult::err(e.to_string(), e.to_string()),
    }
}

async fn download_flow(
    app: &AppHandle,
    ctx: &S3Ctx,
    remote: &RemoteManifest,
    remote_etag: &str,
    pre_local_hash: &str,
) -> SyncRunResult {
    set_status(app, "downloading", "下载数据库…");
    let tmp_gz = match db_package::tmp_path(&format!("download-{}.sqlite.gz", now_millis())) {
        Ok(p) => p,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    let outcome = async {
        ctx.download_file(DB_OBJECT_KEY, &tmp_gz).await.map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&tmp_gz).map_err(|e| e.to_string())?.len();
        if size != remote.size {
            return Err(format!("文件大小不匹配（预期 {}，实际 {size}）", remote.size));
        }
        let hash = db_package::sha256_file(&tmp_gz).map_err(|e| e.to_string())?;
        if hash != remote.sha256 {
            return Err("下载文件校验失败（sha256 不匹配）".to_string());
        }
        set_status(app, "finalizing", "替换本地数据库…");

        let db = app.state::<Db>();
        db::close_database(&db);
        db_package::install_database(&tmp_gz).map_err(|e| e.to_string())?;
        db::init_database(&db).map_err(|e| e.to_string())?;

        let new_hash = db_package::live_db_sha256(&db).map_err(|e| e.to_string())?;
        store::set_cursor(Some(SyncCursor {
            manifest_version: remote.version,
            manifest_etag: remote_etag.to_string(),
            local_sha256: new_hash,
            synced_at: now_iso(),
        }));
        Ok::<(), String>(())
    }
    .await;

    db_package::cleanup_tmp(&tmp_gz);

    match outcome {
        Ok(()) => SyncRunResult::simple("downloaded", format!("已从云端拉取（v{}）", remote.version)),
        Err(e) => SyncRunResult::err(
            format!("下载失败: {e}（本地数据未变更，原 sha256: {}…）", &pre_local_hash[..pre_local_hash.len().min(8)]),
            e,
        ),
    }
}

pub async fn resolve_conflict(app: &AppHandle, resolution: &str) -> SyncRunResult {
    let state = app.state::<SyncState>();
    let Some(info) = state.pending_conflict.lock().unwrap().take() else {
        return SyncRunResult::simple("noop", "无待处理冲突");
    };

    if resolution == "cancel" {
        set_status(app, "idle", "已取消");
        return SyncRunResult::simple("aborted", "已取消");
    }

    if state.running.swap(true, Ordering::SeqCst) {
        return SyncRunResult::err("已有同步任务在进行中", "busy");
    }

    let ctx = match ensure_ctx().await {
        Ok(c) => c,
        Err(e) => {
            state.running.store(false, Ordering::SeqCst);
            return SyncRunResult::err(e.clone(), e);
        }
    };

    let result = if resolution == "use-remote" {
        let local_fp = db::db_key_fingerprint().unwrap_or_default();
        if !info.remote.key_fingerprint.is_empty() && info.remote.key_fingerprint != local_fp {
            let msg = "远端使用了不同的 PIN/加密密钥，无法覆盖本地";
            set_status(app, "error", msg);
            state.running.store(false, Ordering::SeqCst);
            return SyncRunResult::err(msg, "key-mismatch");
        }
        download_flow(app, &ctx, &info.remote, &info.remote_etag, &info.local_sha256).await
    } else {
        upload_flow(app, &ctx, Some((info.remote.clone(), info.remote_etag.clone())), false).await
    };

    finalize(app, &result);
    state.running.store(false, Ordering::SeqCst);
    result
}

async fn prune_backups(ctx: &S3Ctx) {
    let Ok(mut items) = ctx.list_objects("backups/").await else { return };
    items.retain(|(k, _, _)| k.ends_with(".sqlite.gz"));
    items.sort_by_key(|item| std::cmp::Reverse(item.2));
    for (key, _, _) in items.into_iter().skip(BACKUP_RETENTION) {
        if let Err(e) = ctx.delete_object(&key).await {
            log::warn!("[sync] failed to delete old backup {key}: {e}");
        }
    }
}

async fn fetch_key_envelope(ctx: &S3Ctx) -> Result<Option<(KeyEnvelope, String)>, S3Error> {
    match ctx.get_json(KEYENV_KEY).await? {
        Some((value, etag)) => {
            let env: KeyEnvelope =
                serde_json::from_value(value).map_err(|e| S3Error::Other(e.to_string()))?;
            Ok(Some((env, etag)))
        }
        None => Ok(None),
    }
}

pub async fn inspect_cloud(app: &AppHandle) -> Result<SyncCloudInspect, String> {
    let _ = app;
    let ctx = ensure_ctx().await?;
    let remote = manifest::fetch_manifest(&ctx).await.map_err(|e| e.to_string())?;
    let envelope = fetch_key_envelope(&ctx).await.map_err(|e| e.to_string())?;
    let local_fp = db::db_key_fingerprint().map_err(|e| e.to_string())?;
    let envelope_fp = envelope.as_ref().map(|(e, _)| e.key_fingerprint.clone());

    Ok(SyncCloudInspect {
        has_manifest: remote.is_some(),
        has_key_envelope: envelope.is_some(),
        fingerprint_matches: envelope.as_ref().is_some_and(|(e, _)| e.key_fingerprint == local_fp),
        envelope_fingerprint: envelope_fp,
        local_fingerprint: local_fp,
        remote_version: remote.as_ref().map(|(m, _)| m.version),
        remote_writer_device_id: remote.as_ref().map(|(m, _)| m.writer_device_id.clone()),
        remote_written_at: remote.as_ref().map(|(m, _)| m.written_at.clone()),
        envelope_created_at: envelope.as_ref().map(|(e, _)| e.created_at.clone()),
    })
}

async fn put_key_envelope(ctx: &S3Ctx, env: &KeyEnvelope, if_match: Option<&str>) -> Result<String, S3Error> {
    let value = serde_json::to_value(env).map_err(|e| S3Error::Other(e.to_string()))?;
    match if_match {
        Some(etag) => ctx.put_json_if_match(KEYENV_KEY, &value, etag).await,
        None => ctx.put_json_if_absent(KEYENV_KEY, &value).await,
    }
}

pub async fn setup_initial(app: &AppHandle, passphrase: &str) -> SyncRunResult {
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return SyncRunResult::err("已有同步任务在进行中", "busy");
    }
    set_status(app, "preparing", "准备首次设置…");

    let result = async {
        let ctx = ensure_ctx().await.map_err(|e| (e.clone(), e))?;
        if fetch_key_envelope(&ctx).await.map_err(|e| (e.to_string(), e.to_string()))?.is_some() {
            return Err(("云端已存在密钥信封，如需重置请先点击「重置云端」".to_string(), "envelope-exists".to_string()));
        }
        let local_key = db::get_db_key_hex().map_err(|e| (e.to_string(), e.to_string()))?;
        let env = key_envelope::wrap_db_key(&local_key, passphrase, &now_iso())
            .map_err(|e| (e.to_string(), e.to_string()))?;
        put_key_envelope(&ctx, &env, None).await.map_err(|e| (e.to_string(), e.to_string()))?;
        Ok(ctx)
    }
    .await;

    let run = match result {
        Ok(ctx) => upload_flow(app, &ctx, None, true).await,
        Err((message, error)) => SyncRunResult::err(message, error),
    };
    finalize(app, &run);
    state.running.store(false, Ordering::SeqCst);
    run
}

pub async fn setup_join(app: &AppHandle, passphrase: &str) -> SyncRunResult {
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return SyncRunResult::err("已有同步任务在进行中", "busy");
    }
    set_status(app, "preparing", "加入云端同步…");

    let old_key = db::get_db_key_hex().unwrap_or_default();
    let result = join_inner(app, passphrase, &old_key).await;
    finalize(app, &result);
    state.running.store(false, Ordering::SeqCst);
    result
}

async fn join_inner(app: &AppHandle, passphrase: &str, old_key: &str) -> SyncRunResult {
    let ctx = match ensure_ctx().await {
        Ok(c) => c,
        Err(e) => return SyncRunResult::err(e.clone(), e),
    };
    let envelope = match fetch_key_envelope(&ctx).await {
        Ok(Some((e, _))) => e,
        Ok(None) => return SyncRunResult::err("云端没有密钥信封，请改用「首次设置」", "no-envelope"),
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    let new_key = match key_envelope::unwrap_db_key(&envelope, passphrase) {
        Ok(k) => k,
        Err(EnvelopeError::WrongPassphrase) => return SyncRunResult::err("同步口令错误", "wrong-passphrase"),
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    let db = app.state::<Db>();
    let remote = match manifest::fetch_manifest(&ctx).await {
        Ok(r) => r,
        Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
    };

    if let Some((remote_manifest, remote_etag)) = remote {
        let local_schema = schema_version(&db);
        if remote_manifest.schema_version > local_schema {
            return SyncRunResult::err(
                format!("远端数据使用了更新版本的应用（schema {}），请先升级 Moneta 后再同步", remote_manifest.schema_version),
                "schema-mismatch",
            );
        }
        set_status(app, "downloading", "下载远端数据库…");
        let tmp_gz = match db_package::tmp_path(&format!("join-{}.sqlite.gz", now_millis())) {
            Ok(p) => p,
            Err(e) => return SyncRunResult::err(e.to_string(), e.to_string()),
        };

        let install = async {
            ctx.download_file(DB_OBJECT_KEY, &tmp_gz).await.map_err(|e| e.to_string())?;
            let size = std::fs::metadata(&tmp_gz).map_err(|e| e.to_string())?.len();
            if size != remote_manifest.size {
                return Err(format!("文件大小不匹配（预期 {}，实际 {size}）", remote_manifest.size));
            }
            let hash = db_package::sha256_file(&tmp_gz).map_err(|e| e.to_string())?;
            if hash != remote_manifest.sha256 {
                return Err("下载文件校验失败（sha256 不匹配）".to_string());
            }
            set_status(app, "finalizing", "替换本地密钥与数据库…");
            db::close_database(&db);
            db::replace_db_key(&new_key).map_err(|e| e.to_string())?;
            db_package::install_database(&tmp_gz).map_err(|e| e.to_string())?;
            db::init_database(&db).map_err(|e| e.to_string())?;
            let new_hash = db_package::live_db_sha256(&db).map_err(|e| e.to_string())?;
            store::set_cursor(Some(SyncCursor {
                manifest_version: remote_manifest.version,
                manifest_etag: remote_etag.clone(),
                local_sha256: new_hash,
                synced_at: now_iso(),
            }));
            Ok::<(), String>(())
        }
        .await;

        db_package::cleanup_tmp(&tmp_gz);

        return match install {
            Ok(()) => SyncRunResult::simple("downloaded", format!("已加入云端（v{}）", remote_manifest.version)),
            Err(e) => {
                // 回滚旧 key + 重开
                let _ = db::replace_db_key(old_key);
                let _ = db::init_database(&db);
                SyncRunResult::err(format!("加入失败: {e}"), e)
            }
        };
    }

    // 云端无数据库：仅采用新 key，清空本地库重建
    db::close_database(&db);
    let db_path = crate::paths::db_path();
    for f in [
        db_path.clone(),
        crate::paths::data_dir().join("moneta.db-wal"),
        crate::paths::data_dir().join("moneta.db-shm"),
    ] {
        if f.exists() {
            let _ = std::fs::remove_file(f);
        }
    }
    if let Err(e) = db::replace_db_key(&new_key) {
        return SyncRunResult::err(e.to_string(), e.to_string());
    }
    if let Err(e) = db::init_database(&db) {
        return SyncRunResult::err(e.to_string(), e.to_string());
    }
    store::set_cursor(None);
    SyncRunResult::simple("downloaded", "已加入云端（云端尚无数据）")
}

pub async fn setup_adopt_local(app: &AppHandle, passphrase: &str) -> SyncRunResult {
    if passphrase.len() < 8 {
        return SyncRunResult::err("PASSPHRASE_TOO_SHORT", "PASSPHRASE_TOO_SHORT");
    }
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return SyncRunResult::err("已有同步任务在进行中", "busy");
    }
    set_status(app, "preparing", "替换云端数据为本机数据…");

    let result = async {
        let ctx = ensure_ctx().await.map_err(|e| (e.clone(), e))?;
        let local_key = db::get_db_key_hex().map_err(|e| (e.to_string(), e.to_string()))?;
        let env = key_envelope::wrap_db_key(&local_key, passphrase, &now_iso())
            .map_err(|e| (e.to_string(), e.to_string()))?;
        let _ = ctx.delete_object(KEYENV_KEY).await;
        let _ = ctx.delete_object(MANIFEST_KEY).await;
        put_key_envelope(&ctx, &env, None).await.map_err(|e| (e.to_string(), e.to_string()))?;
        Ok(ctx)
    }
    .await;

    let run = match result {
        Ok(ctx) => {
            let r = upload_flow(app, &ctx, None, true).await;
            if r.outcome == "initial-uploaded" {
                SyncRunResult::simple("uploaded", "已用本机数据替换云端，云端版本重置为 v1")
            } else {
                r
            }
        }
        Err((message, error)) => SyncRunResult::err(message, error),
    };
    finalize(app, &run);
    state.running.store(false, Ordering::SeqCst);
    run
}

pub struct ChangePassphraseResult {
    pub ok: bool,
    pub message: String,
    pub error: Option<String>,
}

pub async fn change_passphrase(
    app: &AppHandle,
    old_passphrase: &str,
    new_passphrase: &str,
) -> ChangePassphraseResult {
    if new_passphrase.len() < 8 {
        return ChangePassphraseResult { ok: false, message: "新口令至少需要 8 位".into(), error: Some("PASSPHRASE_TOO_SHORT".into()) };
    }
    if old_passphrase == new_passphrase {
        return ChangePassphraseResult { ok: false, message: "新口令与旧口令相同".into(), error: Some("SAME_PASSPHRASE".into()) };
    }
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return ChangePassphraseResult { ok: false, message: "已有同步任务在进行中".into(), error: Some("busy".into()) };
    }
    set_status(app, "preparing", "修改同步口令…");

    let result = async {
        let ctx = ensure_ctx().await?;
        let (envelope, _) = fetch_key_envelope(&ctx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or("云端没有密钥信封，无法修改口令")?;
        if envelope.key_fingerprint != db::db_key_fingerprint().map_err(|e| e.to_string())? {
            return Err("本机尚未加入云端，请先完成「加入云端」再修改口令".to_string());
        }
        let hex_key = match key_envelope::unwrap_db_key(&envelope, old_passphrase) {
            Ok(k) => k,
            Err(EnvelopeError::WrongPassphrase) => return Err("旧口令错误".to_string()),
            Err(e) => return Err(e.to_string()),
        };
        let new_env = key_envelope::wrap_db_key(&hex_key, new_passphrase, &now_iso()).map_err(|e| e.to_string())?;
        let _ = ctx.delete_object(KEYENV_KEY).await;
        put_key_envelope(&ctx, &new_env, None).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;

    let out = match result {
        Ok(()) => {
            set_status(app, "success", "同步口令已修改");
            ChangePassphraseResult { ok: true, message: "同步口令已修改".into(), error: None }
        }
        Err(e) => {
            set_status(app, "error", &e);
            ChangePassphraseResult { ok: false, message: e.clone(), error: Some(e) }
        }
    };
    state.running.store(false, Ordering::SeqCst);
    out
}

pub struct ResetResult {
    pub ok: bool,
    pub message: String,
}

pub async fn reset_cloud(app: &AppHandle) -> ResetResult {
    let state = app.state::<SyncState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return ResetResult { ok: false, message: "已有同步任务在进行中".into() };
    }
    set_status(app, "preparing", "清理云端数据…");

    let result = async {
        let ctx = ensure_ctx().await?;
        let items = ctx.list_objects("").await.map_err(|e| e.to_string())?;
        for (key, _, _) in items {
            if let Err(e) = ctx.delete_object(&key).await {
                log::warn!("[sync] failed to delete {key}: {e}");
            }
        }
        Ok::<(), String>(())
    }
    .await;

    let out = match result {
        Ok(()) => {
            store::set_cursor(None);
            set_status(app, "idle", "云端已清理");
            ResetResult { ok: true, message: "云端数据已清理".into() }
        }
        Err(e) => {
            set_status(app, "error", &e);
            ResetResult { ok: false, message: e }
        }
    };
    state.running.store(false, Ordering::SeqCst);
    out
}

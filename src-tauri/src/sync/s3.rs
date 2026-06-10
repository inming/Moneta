//! aws-sdk-s3 封装。关键点：
//! - 默认 CRC32 完整性校验头会被阿里云 OSS 拒绝 → request/response checksum 设为 WhenRequired
//! - 阿里云 OSS 不支持 If-Match/If-None-Match → head-then-put 降级
//! - ETag 去引号

use std::path::Path;

use aws_sdk_s3::config::{
    BehaviorVersion, Credentials, Region, RequestChecksumCalculation, ResponseChecksumValidation,
};
use aws_sdk_s3::error::SdkError;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;

use crate::config::StoredSyncConfig;

#[derive(Debug)]
pub enum S3Error {
    Precondition,
    Other(String),
}

impl std::fmt::Display for S3Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            S3Error::Precondition => write!(f, "manifest precondition failed (CAS conflict)"),
            S3Error::Other(s) => write!(f, "{s}"),
        }
    }
}

impl<E, R> From<SdkError<E, R>> for S3Error
where
    SdkError<E, R>: std::error::Error,
{
    fn from(e: SdkError<E, R>) -> Self {
        S3Error::Other(e.to_string())
    }
}

pub struct S3Ctx {
    pub client: Client,
    pub bucket: String,
    pub prefix: String,
    pub conditional_put: bool,
}

pub async fn build_ctx(
    block: &StoredSyncConfig,
    access_key: &str,
    secret_key: &str,
) -> S3Ctx {
    let region = if block.region.is_empty() { "us-east-1".to_string() } else { block.region.clone() };
    let creds = Credentials::new(access_key, secret_key, None, None, "moneta-static");

    let mut loader = aws_sdk_s3::config::Builder::new()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(region))
        .credentials_provider(creds)
        .force_path_style(block.path_style)
        // 阿里云 OSS 等不接受 aws-chunked / CRC32 校验头
        .request_checksum_calculation(RequestChecksumCalculation::WhenRequired)
        .response_checksum_validation(ResponseChecksumValidation::WhenRequired);
    if !block.endpoint.is_empty() {
        loader = loader.endpoint_url(&block.endpoint);
    }

    S3Ctx {
        client: Client::from_conf(loader.build()),
        bucket: block.bucket.clone(),
        prefix: block.prefix.clone(),
        conditional_put: supports_conditional_put(block),
    }
}

fn supports_conditional_put(block: &StoredSyncConfig) -> bool {
    if block.provider == "aliyun" {
        return false;
    }
    if block.endpoint.to_lowercase().contains("aliyuncs.com") {
        return false;
    }
    true
}

fn full_key(prefix: &str, key: &str) -> String {
    let normalized = prefix.trim_start_matches('/');
    if normalized.is_empty() {
        key.to_string()
    } else {
        format!("{normalized}{key}")
    }
}

fn strip_quotes(etag: &str) -> String {
    etag.trim_matches('"').to_string()
}

fn is_not_found(e: &str) -> bool {
    e.contains("NoSuchKey") || e.contains("NotFound") || e.contains("status: 404") || e.contains("StatusCode(404)")
}

fn is_precondition(e: &str) -> bool {
    e.contains("PreconditionFailed") || e.contains("status: 412") || e.contains("StatusCode(412)")
}

impl S3Ctx {
    pub async fn get_json(&self, key: &str) -> Result<Option<(serde_json::Value, String)>, S3Error> {
        let res = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .send()
            .await;
        match res {
            Ok(out) => {
                let etag = out.e_tag().map(strip_quotes).unwrap_or_default();
                let bytes = out.body.collect().await.map_err(|e| S3Error::Other(e.to_string()))?.into_bytes();
                let value: serde_json::Value =
                    serde_json::from_slice(&bytes).map_err(|e| S3Error::Other(e.to_string()))?;
                Ok(Some((value, etag)))
            }
            Err(e) => {
                let msg = format!("{e:?}");
                if is_not_found(&msg) {
                    Ok(None)
                } else {
                    Err(S3Error::Other(msg))
                }
            }
        }
    }

    async fn raw_put_json(&self, key: &str, body: &serde_json::Value) -> Result<String, S3Error> {
        let data = serde_json::to_vec_pretty(body).map_err(|e| S3Error::Other(e.to_string()))?;
        let out = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .body(ByteStream::from(data))
            .content_type("application/json")
            .send()
            .await?;
        Ok(out.e_tag().map(strip_quotes).unwrap_or_default())
    }

    /// 条件更新（if_match）。OSS 走 head-then-put 降级。
    pub async fn put_json_if_match(
        &self,
        key: &str,
        body: &serde_json::Value,
        if_match_etag: &str,
    ) -> Result<String, S3Error> {
        if !self.conditional_put {
            let head = self.head_object(key).await?;
            match head {
                Some((etag, _)) if etag == if_match_etag => self.raw_put_json(key, body).await,
                _ => Err(S3Error::Precondition),
            }
        } else {
            let data = serde_json::to_vec_pretty(body).map_err(|e| S3Error::Other(e.to_string()))?;
            let res = self
                .client
                .put_object()
                .bucket(&self.bucket)
                .key(full_key(&self.prefix, key))
                .body(ByteStream::from(data))
                .content_type("application/json")
                .if_match(if_match_etag)
                .send()
                .await;
            match res {
                Ok(out) => Ok(out.e_tag().map(strip_quotes).unwrap_or_default()),
                Err(e) => {
                    let msg = format!("{e:?}");
                    if is_precondition(&msg) {
                        Err(S3Error::Precondition)
                    } else {
                        Err(S3Error::Other(msg))
                    }
                }
            }
        }
    }

    /// 仅当不存在时写入（if_none_match=*）。OSS 走 head-then-put 降级。
    pub async fn put_json_if_absent(
        &self,
        key: &str,
        body: &serde_json::Value,
    ) -> Result<String, S3Error> {
        if !self.conditional_put {
            if self.head_object(key).await?.is_some() {
                return Err(S3Error::Precondition);
            }
            return self.raw_put_json(key, body).await;
        }
        let data = serde_json::to_vec_pretty(body).map_err(|e| S3Error::Other(e.to_string()))?;
        let res = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .body(ByteStream::from(data))
            .content_type("application/json")
            .if_none_match("*")
            .send()
            .await;
        match res {
            Ok(out) => Ok(out.e_tag().map(strip_quotes).unwrap_or_default()),
            Err(e) => {
                let msg = format!("{e:?}");
                if is_precondition(&msg) {
                    Err(S3Error::Precondition)
                } else {
                    Err(S3Error::Other(msg))
                }
            }
        }
    }

    pub async fn upload_file(&self, key: &str, path: &Path, content_type: &str) -> Result<(), S3Error> {
        let body = ByteStream::from_path(path)
            .await
            .map_err(|e| S3Error::Other(e.to_string()))?;
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .body(body)
            .content_type(content_type)
            .send()
            .await?;
        Ok(())
    }

    pub async fn download_file(&self, key: &str, dest: &Path) -> Result<(), S3Error> {
        let out = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .send()
            .await?;
        let mut body = out.body.into_async_read();
        let mut file = tokio::fs::File::create(dest)
            .await
            .map_err(|e| S3Error::Other(e.to_string()))?;
        tokio::io::copy(&mut body, &mut file)
            .await
            .map_err(|e| S3Error::Other(e.to_string()))?;
        Ok(())
    }

    pub async fn head_object(&self, key: &str) -> Result<Option<(String, u64)>, S3Error> {
        let res = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .send()
            .await;
        match res {
            Ok(out) => Ok(Some((
                out.e_tag().map(strip_quotes).unwrap_or_default(),
                out.content_length().unwrap_or(0) as u64,
            ))),
            Err(e) => {
                let msg = format!("{e:?}");
                if is_not_found(&msg) {
                    Ok(None)
                } else {
                    Err(S3Error::Other(msg))
                }
            }
        }
    }

    pub async fn delete_object(&self, key: &str) -> Result<(), S3Error> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(full_key(&self.prefix, key))
            .send()
            .await?;
        Ok(())
    }

    /// 列举对象，返回相对 prefix 的 key + 大小 + 最后修改时间（毫秒）
    pub async fn list_objects(&self, sub_prefix: &str) -> Result<Vec<(String, u64, i64)>, S3Error> {
        let full_prefix = full_key(&self.prefix, sub_prefix);
        let mut out = Vec::new();
        let mut token: Option<String> = None;
        loop {
            let mut req = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(&full_prefix);
            if let Some(t) = &token {
                req = req.continuation_token(t);
            }
            let res = req.send().await?;
            for obj in res.contents() {
                let Some(key) = obj.key() else { continue };
                let rel = key.strip_prefix(self.prefix.as_str()).unwrap_or(key).to_string();
                let modified = obj.last_modified().map(|t| t.to_millis().unwrap_or(0)).unwrap_or(0);
                out.push((rel, obj.size().unwrap_or(0) as u64, modified));
            }
            if res.is_truncated().unwrap_or(false) {
                token = res.next_continuation_token().map(String::from);
            } else {
                break;
            }
        }
        Ok(out)
    }
}

//! 密钥信封 keyenv.json：用同步口令（passphrase）经 PBKDF2-SHA256(600k) 派生
//! AES-256-GCM key，加密数据库的 SQLCipher hex key。
//! 字段格式与旧 Electron 版逐字段一致，保证新旧云端互通。

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::Digest;

const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_LEN: usize = 32;
pub const KEYENV_KEY: &str = "keyenv.json";

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Kdf {
    pub algo: String,
    pub iterations: u32,
    pub salt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cipher {
    pub algo: String,
    pub iv: String,
    pub ciphertext: String,
    pub tag: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyEnvelope {
    pub format: u32,
    pub kdf: Kdf,
    pub cipher: Cipher,
    #[serde(rename = "keyFingerprint")]
    pub key_fingerprint: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug)]
pub enum EnvelopeError {
    PassphraseTooShort,
    WrongPassphrase,
    Unsupported(String),
}

impl std::fmt::Display for EnvelopeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnvelopeError::PassphraseTooShort => write!(f, "PASSPHRASE_TOO_SHORT"),
            EnvelopeError::WrongPassphrase => write!(f, "passphrase incorrect"),
            EnvelopeError::Unsupported(s) => write!(f, "{s}"),
        }
    }
}

pub fn fingerprint(hex_key: &str) -> String {
    hex::encode(sha2::Sha256::digest(hex_key.as_bytes()))[..32].to_string()
}

fn derive_key(passphrase: &str, salt: &[u8], iterations: u32) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(passphrase.as_bytes(), salt, iterations, &mut key);
    key
}

pub fn wrap_db_key(hex_key: &str, passphrase: &str, now_iso: &str) -> Result<KeyEnvelope, EnvelopeError> {
    if passphrase.len() < 8 {
        return Err(EnvelopeError::PassphraseTooShort);
    }
    let salt: [u8; 16] = rand::random();
    let derived = derive_key(passphrase, &salt, PBKDF2_ITERATIONS);
    let iv: [u8; 12] = rand::random();
    let cipher = Aes256Gcm::new_from_slice(&derived).unwrap();
    // aes-gcm 把 16 字节 tag 追加在密文尾部；旧 Node 版把 tag 单独存
    let combined = cipher
        .encrypt(Nonce::from_slice(&iv), hex_key.as_bytes())
        .map_err(|_| EnvelopeError::Unsupported("加密失败".into()))?;
    let (ciphertext, tag) = combined.split_at(combined.len() - 16);

    Ok(KeyEnvelope {
        format: 1,
        kdf: Kdf {
            algo: "pbkdf2-sha256".into(),
            iterations: PBKDF2_ITERATIONS,
            salt: b64().encode(salt),
        },
        cipher: Cipher {
            algo: "aes-256-gcm".into(),
            iv: b64().encode(iv),
            ciphertext: b64().encode(ciphertext),
            tag: b64().encode(tag),
        },
        key_fingerprint: fingerprint(hex_key),
        created_at: now_iso.to_string(),
    })
}

pub fn unwrap_db_key(envelope: &KeyEnvelope, passphrase: &str) -> Result<String, EnvelopeError> {
    if envelope.format != 1 {
        return Err(EnvelopeError::Unsupported("UNSUPPORTED_FORMAT".into()));
    }
    if envelope.kdf.algo != "pbkdf2-sha256" {
        return Err(EnvelopeError::Unsupported("UNSUPPORTED_KDF".into()));
    }
    if envelope.cipher.algo != "aes-256-gcm" {
        return Err(EnvelopeError::Unsupported("UNSUPPORTED_CIPHER".into()));
    }
    let salt = b64().decode(&envelope.kdf.salt).map_err(|_| EnvelopeError::WrongPassphrase)?;
    let derived = derive_key(passphrase, &salt, envelope.kdf.iterations);
    let iv = b64().decode(&envelope.cipher.iv).map_err(|_| EnvelopeError::WrongPassphrase)?;
    let mut ciphertext = b64()
        .decode(&envelope.cipher.ciphertext)
        .map_err(|_| EnvelopeError::WrongPassphrase)?;
    let tag = b64().decode(&envelope.cipher.tag).map_err(|_| EnvelopeError::WrongPassphrase)?;
    // 重新拼成 aes-gcm 期望的 ciphertext||tag
    ciphertext.extend_from_slice(&tag);

    let cipher = Aes256Gcm::new_from_slice(&derived).unwrap();
    let plain = cipher
        .decrypt(Nonce::from_slice(&iv), ciphertext.as_ref())
        .map_err(|_| EnvelopeError::WrongPassphrase)?;
    let hex_key = String::from_utf8(plain).map_err(|_| EnvelopeError::WrongPassphrase)?;
    if fingerprint(&hex_key) != envelope.key_fingerprint {
        return Err(EnvelopeError::WrongPassphrase);
    }
    Ok(hex_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_unwrap_roundtrip() {
        let key = "ab".repeat(32);
        let env = wrap_db_key(&key, "correct horse", "2025-01-01T00:00:00.000Z").unwrap();
        assert_eq!(env.kdf.iterations, 600_000);
        assert_eq!(unwrap_db_key(&env, "correct horse").unwrap(), key);
        assert!(matches!(unwrap_db_key(&env, "wrong"), Err(EnvelopeError::WrongPassphrase)));
    }

    #[test]
    fn rejects_short_passphrase() {
        assert!(matches!(
            wrap_db_key(&"a".repeat(64), "short", "now"),
            Err(EnvelopeError::PassphraseTooShort)
        ));
    }

    /// 解开旧 Electron 版（Node crypto）生成的真实信封，验证跨实现互通。
    /// 用 Node 端 keyEnvelope.wrapDbKey 预生成的 JSON（口令 "test-passphrase-123"，key 全 'a'）。
    #[test]
    fn unwraps_node_generated_envelope() {
        let json = std::env::var("MONETA_NODE_KEYENV").ok();
        let Some(json) = json else {
            // 无 fixture 时跳过（CI 会注入）
            return;
        };
        let env: KeyEnvelope = serde_json::from_str(&json).unwrap();
        let key = unwrap_db_key(&env, "test-passphrase-123").unwrap();
        assert_eq!(key, "a".repeat(64));
    }
}

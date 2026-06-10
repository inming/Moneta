//! 旧 Electron safeStorage 密文的兼容解密（仅用于首启迁移）。
//!
//! - macOS：Chromium os_crypt —— login keychain 的 "<app> Safe Storage" 密码
//!   经 PBKDF2-HMAC-SHA1(pwd, "saltysalt", 1003) 派生 AES-128 key，
//!   密文 = "v10" + AES-128-CBC(IV=16×0x20) + PKCS7。
//! - Windows：Chromium os_crypt —— "v10" + AES-256-GCM（key 在 userData/Local State
//!   的 os_crypt.encrypted_key，DPAPI 包裹）；或裸 DPAPI blob（早期 Electron）。
//! - 兜底：safeStorage 不可用时旧版存的是纯 base64。

use base64::Engine;

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

/// 解密旧 config.json 中的 safeStorage 密文（输入为 base64 字符串）。
pub fn decrypt_string(encrypted_b64: &str) -> Result<String, String> {
    if encrypted_b64.is_empty() {
        return Ok(String::new());
    }
    let raw = b64()
        .decode(encrypted_b64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;

    if raw.starts_with(b"v10") {
        return decrypt_v10(&raw[3..]);
    }

    #[cfg(windows)]
    if raw.starts_with(&[0x01, 0x00, 0x00, 0x00]) {
        return platform::dpapi_unprotect(&raw);
    }

    // legacy：纯 base64 存储（safeStorage 不可用时的旧版降级路径）
    String::from_utf8(raw).map_err(|_| "legacy 密文不是有效 UTF-8".to_string())
}

fn decrypt_v10(ciphertext: &[u8]) -> Result<String, String> {
    platform::decrypt_v10(ciphertext)
}

#[cfg(target_os = "macos")]
mod platform {
    use aes::cipher::{block_padding::Pkcs7, BlockModeDecrypt, KeyIvInit};

    /// 旧 Electron 的 keychain 条目候选：dev 运行时 app name 取自 package.json
    /// 的 name（小写 moneta，实测如此）；打包版可能为 Moneta；兜底 Electron。
    const CANDIDATES: &[(&str, &str)] = &[
        ("moneta Safe Storage", "moneta Key"),
        ("Moneta Safe Storage", "Moneta Key"),
        ("moneta Safe Storage", "moneta"),
        ("Moneta Safe Storage", "Moneta"),
        ("Electron Safe Storage", "Electron Key"),
        ("Electron Safe Storage", "Electron"),
    ];

    fn candidate_passwords() -> Vec<Vec<u8>> {
        CANDIDATES
            .iter()
            .filter_map(|(service, account)| {
                security_framework::passwords::get_generic_password(service, account).ok()
            })
            .collect()
    }

    pub fn decrypt_v10(ciphertext: &[u8]) -> Result<String, String> {
        let passwords = candidate_passwords();
        if passwords.is_empty() {
            return Err("未能从钥匙串读取旧版加密密码（条目不存在或访问被拒绝）".to_string());
        }
        for password in &passwords {
            let mut key = [0u8; 16];
            pbkdf2::pbkdf2_hmac::<sha1::Sha1>(password, b"saltysalt", 1003, &mut key);
            let iv = [0x20u8; 16];
            let dec = cbc::Decryptor::<aes::Aes128>::new(&key.into(), &iv.into());
            let mut buf = ciphertext.to_vec();
            if let Ok(plain) = dec.decrypt_padded::<Pkcs7>(&mut buf) {
                if let Ok(s) = String::from_utf8(plain.to_vec()) {
                    return Ok(s);
                }
            }
        }
        Err("钥匙串密码无法解开该密文（可能来自其他设备）".to_string())
    }
}

#[cfg(windows)]
mod platform {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use base64::Engine;

    pub fn dpapi_unprotect(blob: &[u8]) -> Result<String, String> {
        let plain = dpapi_unprotect_bytes(blob)?;
        String::from_utf8(plain).map_err(|_| "DPAPI 明文不是有效 UTF-8".to_string())
    }

    pub fn dpapi_unprotect_bytes(blob: &[u8]) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::HLOCAL;
        use windows::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPT_INTEGER_BLOB,
        };
        use windows::Win32::System::Memory::LocalFree;

        unsafe {
            let input = CRYPT_INTEGER_BLOB {
                cbData: blob.len() as u32,
                pbData: blob.as_ptr() as *mut u8,
            };
            let mut output = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(&input, None, None, None, None, 0, &mut output)
                .map_err(|e| format!("DPAPI 解密失败: {e}"))?;
            let data = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut core::ffi::c_void)));
            Ok(data)
        }
    }

    fn os_crypt_key() -> Result<Vec<u8>, String> {
        let local_state_path = crate::paths::data_dir().join("Local State");
        let raw = std::fs::read_to_string(&local_state_path)
            .map_err(|e| format!("读取 Local State 失败: {e}"))?;
        let json: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("Local State 解析失败: {e}"))?;
        let encrypted_key_b64 = json["os_crypt"]["encrypted_key"]
            .as_str()
            .ok_or("Local State 缺少 os_crypt.encrypted_key")?;
        let wrapped = base64::engine::general_purpose::STANDARD
            .decode(encrypted_key_b64)
            .map_err(|e| format!("encrypted_key base64 解码失败: {e}"))?;
        let dpapi_blob = wrapped
            .strip_prefix(b"DPAPI")
            .ok_or("encrypted_key 缺少 DPAPI 前缀")?;
        dpapi_unprotect_bytes(dpapi_blob)
    }

    pub fn decrypt_v10(ciphertext: &[u8]) -> Result<String, String> {
        if ciphertext.len() < 12 + 16 {
            return Err("v10 密文长度不足".to_string());
        }
        let key = os_crypt_key()?;
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("AES key 无效: {e}"))?;
        let (nonce, ct) = ciphertext.split_at(12);
        let plain = cipher
            .decrypt(Nonce::from_slice(nonce), ct)
            .map_err(|_| "AES-GCM 解密失败".to_string())?;
        String::from_utf8(plain).map_err(|_| "v10 明文不是有效 UTF-8".to_string())
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn decrypt_v10(_ciphertext: &[u8]) -> Result<String, String> {
        Err("当前平台不支持解密旧 Electron safeStorage 密文".to_string())
    }
}

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::config;
use crate::error::{AppError, AppResult};
use crate::secrets::{self, SecretKey};

const MAX_ATTEMPTS: i64 = 5;
const LOCKOUT_DURATION_MS: i64 = 30_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyPinResult {
    pub success: bool,
    pub remaining_attempts: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked_until_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ChangePinResult {
    pub success: bool,
}

fn hash_pin(pin: &str, salt: &str) -> String {
    hex::encode(Sha256::digest(format!("{salt}{pin}").as_bytes()))
}

pub fn has_pin() -> AppResult<bool> {
    Ok(secrets::get_secret(SecretKey::Pin)?.is_some())
}

pub fn set_pin(pin: &str) -> AppResult<()> {
    let salt_bytes: [u8; 16] = rand::random();
    let salt = hex::encode(salt_bytes);
    let hash = hash_pin(pin, &salt);
    secrets::set_secret(SecretKey::Pin, &format!("{salt}:{hash}"))?;

    let mut cfg = config::load_config();
    cfg.pin_fail_count = 0;
    cfg.pin_locked_until = String::new();
    config::save_config(&cfg);
    Ok(())
}

pub fn verify_pin(pin: &str) -> AppResult<VerifyPinResult> {
    let mut cfg = config::load_config();
    let now_ms = Utc::now().timestamp_millis();

    // 锁定期检查
    if !cfg.pin_locked_until.is_empty() {
        if let Ok(locked_until) = DateTime::parse_from_rfc3339(&cfg.pin_locked_until) {
            let locked_until_ms = locked_until.timestamp_millis();
            if now_ms < locked_until_ms {
                return Ok(VerifyPinResult {
                    success: false,
                    remaining_attempts: 0,
                    locked_until_ms: Some(locked_until_ms),
                });
            }
        }
        // 锁定已过期，重置
        cfg.pin_fail_count = 0;
        cfg.pin_locked_until = String::new();
    }

    let stored = secrets::get_secret(SecretKey::Pin)?
        .ok_or_else(|| AppError::msg("PIN 未设置"))?;
    let (salt, stored_hash) = stored
        .split_once(':')
        .ok_or_else(|| AppError::msg("PIN 存储格式损坏"))?;

    if hash_pin(pin, salt) == stored_hash {
        cfg.pin_fail_count = 0;
        cfg.pin_locked_until = String::new();
        config::save_config(&cfg);
        return Ok(VerifyPinResult {
            success: true,
            remaining_attempts: MAX_ATTEMPTS,
            locked_until_ms: None,
        });
    }

    cfg.pin_fail_count += 1;
    let remaining = MAX_ATTEMPTS - cfg.pin_fail_count;

    if remaining <= 0 {
        let locked_until = Utc::now() + chrono::Duration::milliseconds(LOCKOUT_DURATION_MS);
        cfg.pin_locked_until = locked_until.to_rfc3339_opts(SecondsFormat::Millis, true);
        cfg.pin_fail_count = 0;
        config::save_config(&cfg);
        return Ok(VerifyPinResult {
            success: false,
            remaining_attempts: 0,
            locked_until_ms: Some(locked_until.timestamp_millis()),
        });
    }

    config::save_config(&cfg);
    Ok(VerifyPinResult {
        success: false,
        remaining_attempts: remaining,
        locked_until_ms: None,
    })
}

pub fn change_pin(current_pin: &str, new_pin: &str) -> AppResult<ChangePinResult> {
    let result = verify_pin(current_pin)?;
    if !result.success {
        return Ok(ChangePinResult { success: false });
    }
    set_pin(new_pin)?;
    Ok(ChangePinResult { success: true })
}

pub fn get_auto_lock_minutes() -> i64 {
    config::load_config().auto_lock_minutes
}

pub fn set_auto_lock_minutes(minutes: i64) {
    let mut cfg = config::load_config();
    cfg.auto_lock_minutes = minutes;
    config::save_config(&cfg);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::isolated_env as setup;

    #[test]
    fn pin_roundtrip_and_lockout() {
        let (_guard, _dir) = setup();
        assert!(!has_pin().unwrap());
        set_pin("1234").unwrap();
        assert!(has_pin().unwrap());

        let ok = verify_pin("1234").unwrap();
        assert!(ok.success);

        // 5 次失败触发 30s 锁定
        for i in 1..=5 {
            let r = verify_pin("0000").unwrap();
            assert!(!r.success);
            if i < 5 {
                assert_eq!(r.remaining_attempts, 5 - i);
            } else {
                assert_eq!(r.remaining_attempts, 0);
                assert!(r.locked_until_ms.is_some());
            }
        }
        // 锁定期内即使输入正确 PIN 也拒绝
        let locked = verify_pin("1234").unwrap();
        assert!(!locked.success);
        assert!(locked.locked_until_ms.is_some());
    }

    #[test]
    fn change_pin_requires_current() {
        let (_guard, _dir) = setup();
        set_pin("1111").unwrap();
        assert!(!change_pin("9999", "2222").unwrap().success);
        assert!(change_pin("1111", "2222").unwrap().success);
        assert!(verify_pin("2222").unwrap().success);
    }
}

pub mod migrator;
pub mod repo;

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::paths;
use crate::secrets::{self, SecretKey};

/// 全局数据库连接。Option 是因为同步安装下载库时需要 close → 替换文件 → reopen。
pub struct Db(pub Mutex<Option<Connection>>);

impl Default for Db {
    fn default() -> Self {
        Db(Mutex::new(None))
    }
}

/// 打开加密数据库。文件格式为 sqlite3mc 的 chacha20（与旧 Electron 端一致，
/// 见 vendor/libsqlite3-sys 的替换说明）。raw key 模式跳过 KDF。
pub fn open_connection(path: &Path, hex_key: &str) -> AppResult<Connection> {
    let conn = Connection::open(path).map_err(|e| AppError::Db(e.to_string()))?;
    conn.pragma_update(None, "cipher", "chacha20")
        .map_err(|e| AppError::Db(e.to_string()))?;
    conn.pragma_update(None, "key", format!("x'{hex_key}'"))
        .map_err(|e| AppError::Db(e.to_string()))?;
    // 触发实际读取以验证密钥
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| AppError::Db("数据库无法打开（密钥不正确或文件损坏）".into()))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| AppError::Db(e.to_string()))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| AppError::Db(e.to_string()))?;
    Ok(conn)
}

/// 供首启秘密迁移做"真实开库验证"的钩子
pub fn validate_db_key(hex_key: &str) -> Result<(), String> {
    let conn = Connection::open_with_flags(
        paths::db_path(),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "cipher", "chacha20").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "key", format!("x'{hex_key}'")).map_err(|e| e.to_string())?;
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| "密钥无法打开数据库".to_string())?;
    Ok(())
}

/// 获取（必要时生成）数据库密钥。
/// - keyring 已有 → 直接用
/// - keyring 没有但 db 文件存在 → 报错（绝不能用新 key 去开旧库）
/// - 全新安装 → 生成随机 32 字节 key 存入 keyring
fn ensure_db_key() -> AppResult<String> {
    if let Some(key) = secrets::get_secret(SecretKey::DbKey)? {
        return Ok(key);
    }
    if paths::db_path().exists() {
        return Err(AppError::Db(
            "数据库文件存在但密钥缺失：请先完成数据迁移或从同步恢复".into(),
        ));
    }
    let key_bytes: [u8; 32] = rand::random();
    let key = hex::encode(key_bytes);
    secrets::set_secret(SecretKey::DbKey, &key)?;
    Ok(key)
}

/// 初始化数据库：开库 + 跑迁移，结果放入全局 state
pub fn init_database(db_state: &Db) -> AppResult<()> {
    let key = ensure_db_key()?;
    let conn = open_connection(&paths::db_path(), &key)?;
    migrator::run_migrations(&conn).map_err(|e| AppError::Db(format!("迁移执行失败: {e}")))?;
    *db_state.0.lock().unwrap() = Some(conn);
    Ok(())
}

pub fn close_database(db_state: &Db) {
    *db_state.0.lock().unwrap() = None;
}

/// 在持有连接的情况下执行闭包（统一的"连接未就绪"错误）
pub fn with_db<T>(db_state: &Db, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
    let guard = db_state.0.lock().unwrap();
    let conn = guard
        .as_ref()
        .ok_or_else(|| AppError::Db("数据库尚未就绪".into()))?;
    f(conn)
}

pub fn db_key_fingerprint() -> AppResult<String> {
    use sha2::Digest;
    let key = secrets::get_secret(SecretKey::DbKey)?
        .ok_or_else(|| AppError::Db("数据库密钥缺失".into()))?;
    Ok(hex::encode(sha2::Sha256::digest(key.as_bytes()))[..32].to_string())
}

pub fn get_db_key_hex() -> AppResult<String> {
    secrets::get_secret(SecretKey::DbKey)?
        .ok_or_else(|| AppError::Db("数据库密钥缺失".into()))
}

/// 替换本机 SQLCipher 密钥（同步加入云端时）。调用方负责先 close 数据库、
/// 安排好新 db 文件后再 reopen。
pub fn replace_db_key(new_hex_key: &str) -> AppResult<()> {
    secrets::set_secret(SecretKey::DbKey, new_hex_key)
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    /// 测试用：临时目录里建一个加密库并跑全部迁移
    pub fn fresh_test_db() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let key = "ab".repeat(32);
        let conn = open_connection(&dir.path().join("test.db"), &key).unwrap();
        migrator::run_migrations(&conn).unwrap();
        (dir, conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实数据兼容冒烟：需要环境变量指向真实库副本与密钥文件。
    /// 运行：MONETA_REAL_DB=... MONETA_REAL_KEY_FILE=... cargo test real_db -- --ignored
    #[test]
    #[ignore]
    fn real_db_smoke() {
        let db_path = std::env::var("MONETA_REAL_DB").expect("MONETA_REAL_DB not set");
        let key = std::fs::read_to_string(
            std::env::var("MONETA_REAL_KEY_FILE").expect("MONETA_REAL_KEY_FILE not set"),
        )
        .unwrap()
        .trim()
        .to_string();

        let conn = open_connection(std::path::Path::new(&db_path), &key).unwrap();
        // 迁移幂等（真实库已应用过全部迁移）
        migrator::run_migrations(&conn).unwrap();

        let params = crate::models::TransactionListParams::default();
        let page = crate::db::repo::transaction::find_all(&conn, &params).unwrap();
        println!("real db: {} transactions, page items {}", page.total, page.items.len());
        assert!(page.total > 0);

        let cats = crate::db::repo::category::find_all(&conn, None).unwrap();
        println!("real db: {} active categories", cats.len());
        assert!(!cats.is_empty());

        let range = crate::db::repo::stats::get_year_range(&conn).unwrap();
        println!("real db: years {}..{}", range.min_year, range.max_year);

        let cross = crate::db::repo::stats::get_cross_table(
            &conn,
            &crate::models::CrossTableParams {
                year: range.max_year,
                tx_type: "expense".into(),
                operator_id: None,
            },
        )
        .unwrap();
        println!(
            "real db: cross table rows={} yearly_total={:.2}",
            cross.rows.len(),
            cross.totals.yearly
        );
        assert!(!cross.rows.is_empty());
    }
}

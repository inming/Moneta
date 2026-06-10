//! 数据库打包：WAL checkpoint → gzip → SHA256；以及下载安装/回滚。

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use flate2::write::GzEncoder;
use flate2::read::GzDecoder;
use flate2::Compression;
use sha2::Digest;

use crate::db::{self, Db};
use crate::error::{AppError, AppResult};
use crate::paths;

pub struct PackagedDb {
    pub file_path: PathBuf,
    pub size: u64,
    pub sha256: String,
}

fn tmp_dir() -> AppResult<PathBuf> {
    let dir = paths::data_dir().join("sync-tmp");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = sha2::Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// WAL checkpoint（TRUNCATE）让 db 文件落盘，使打包/哈希准确
fn checkpoint(db: &Db) -> AppResult<()> {
    db::with_db(db, |conn| {
        conn.pragma_update(None, "wal_checkpoint", "TRUNCATE")
            .map_err(|e| AppError::Db(e.to_string()))?;
        Ok(())
    })
}

/// 当前库的 sha256（先 checkpoint）
pub fn live_db_sha256(db: &Db) -> AppResult<String> {
    checkpoint(db)?;
    sha256_file(&paths::db_path())
}

/// checkpoint → gzip(Z_BEST_SPEED) 到临时 .gz；返回 size + sha256（用于 manifest）
pub fn package_database(db: &Db, now_millis: i64) -> AppResult<PackagedDb> {
    checkpoint(db)?;
    let db_path = paths::db_path();
    if !db_path.exists() {
        return Err(AppError::Db(format!("数据库文件不存在: {}", db_path.display())));
    }
    let tmp_gz = tmp_dir()?.join(format!("upload-{now_millis}.sqlite.gz"));

    let mut input = std::fs::File::open(&db_path)?;
    let output = std::fs::File::create(&tmp_gz)?;
    let mut encoder = GzEncoder::new(output, Compression::fast());
    let mut buf = [0u8; 65536];
    loop {
        let n = input.read(&mut buf)?;
        if n == 0 {
            break;
        }
        encoder.write_all(&buf[..n])?;
    }
    encoder.finish()?;

    let size = std::fs::metadata(&tmp_gz)?.len();
    let sha256 = sha256_file(&tmp_gz)?;
    Ok(PackagedDb { file_path: tmp_gz, size, sha256 })
}

/// 用下载的 gz 文件替换本地库（调用方已校验 sha256）；失败回滚。
/// 调用前必须 close 数据库（db state 设为 None）。
pub fn install_database(downloaded_gz: &Path) -> AppResult<()> {
    let db_path = paths::db_path();
    let wal = paths::data_dir().join("moneta.db-wal");
    let shm = paths::data_dir().join("moneta.db-shm");
    let backup = paths::data_dir().join("moneta.db.sync.bak");

    for f in [&wal, &shm] {
        if f.exists() {
            let _ = std::fs::remove_file(f);
        }
    }
    if db_path.exists() {
        std::fs::rename(&db_path, &backup)?;
    }

    let result = (|| -> AppResult<()> {
        let input = std::fs::File::open(downloaded_gz)?;
        let mut decoder = GzDecoder::new(input);
        let mut output = std::fs::File::create(&db_path)?;
        std::io::copy(&mut decoder, &mut output)?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            if backup.exists() {
                let _ = std::fs::remove_file(&backup);
            }
            Ok(())
        }
        Err(e) => {
            if db_path.exists() {
                let _ = std::fs::remove_file(&db_path);
            }
            if backup.exists() {
                let _ = std::fs::rename(&backup, &db_path);
            }
            Err(e)
        }
    }
}

pub fn cleanup_tmp(path: &Path) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn tmp_path(name: &str) -> AppResult<PathBuf> {
    Ok(tmp_dir()?.join(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gzip_roundtrip_sha_stable() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("data.bin");
        std::fs::write(&src, b"hello moneta sync \x00\x01\x02").unwrap();
        let sha_a = sha256_file(&src).unwrap();

        // gzip then gunzip 还原一致
        let gz = dir.path().join("data.gz");
        {
            let mut input = std::fs::File::open(&src).unwrap();
            let out = std::fs::File::create(&gz).unwrap();
            let mut enc = GzEncoder::new(out, Compression::fast());
            std::io::copy(&mut input, &mut enc).unwrap();
            enc.finish().unwrap();
        }
        let restored = dir.path().join("restored.bin");
        {
            let input = std::fs::File::open(&gz).unwrap();
            let mut dec = GzDecoder::new(input);
            let mut out = std::fs::File::create(&restored).unwrap();
            std::io::copy(&mut dec, &mut out).unwrap();
        }
        assert_eq!(sha256_file(&restored).unwrap(), sha_a);
    }
}

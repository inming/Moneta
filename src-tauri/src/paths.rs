use std::path::PathBuf;

/// 应用数据目录。沿用旧 Electron 版的 userData 路径（macOS:
/// ~/Library/Application Support/Moneta，Windows: %APPDATA%\Moneta），
/// 老用户数据零拷贝接管。`MONETA_DATA_DIR` 环境变量用于开发/测试隔离。
pub fn data_dir() -> PathBuf {
    let dir = match std::env::var("MONETA_DATA_DIR") {
        Ok(p) if !p.is_empty() => PathBuf::from(p),
        _ => dirs::data_dir()
            .expect("cannot resolve OS data dir")
            .join("Moneta"),
    };
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn db_path() -> PathBuf {
    data_dir().join("moneta.db")
}

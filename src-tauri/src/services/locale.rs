/// 系统语言检测：所有中文变体 → zh-CN，其余 → en-US（与旧版语义一致）
pub fn detect_system_language() -> String {
    let locale = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    if locale.starts_with("zh") {
        "zh-CN".to_string()
    } else {
        "en-US".to_string()
    }
}

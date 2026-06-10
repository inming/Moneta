use std::sync::Mutex;

use crate::secrets::migrate::BootstrapStatus;

/// 首启迁移/初始化状态，渲染层经 app_bootstrap_status 轮询
pub struct Bootstrap(pub Mutex<BootstrapStatus>);

impl Default for Bootstrap {
    fn default() -> Self {
        Bootstrap(Mutex::new(BootstrapStatus::pending()))
    }
}

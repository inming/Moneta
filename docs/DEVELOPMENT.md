# 开发环境配置指南

## 快速开始

### 方式 1：自动化脚本（推荐）

**macOS / Linux / WSL2:**
```bash
bash scripts/setup-env.sh
```

**Windows:**
```cmd
scripts\setup-env.bat
```

### 方式 2：手动配置

按照下面的详细步骤配置。

---

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | 24+ (LTS) | 渲染层（vite + React） |
| **npm** | 10.x+ | 随 Node.js 安装 |
| **Rust** | stable | Tauri 后端 + MCP sidecar，`rustup` 安装 |
| **Git** | 2.x+ | 版本控制 |

> 本项目已迁移到 **Tauri 2.x**（Rust 后端），不再需要 Node 原生模块编译链（Python / setuptools / node-gyp）。开发命令见 [CLAUDE.md](../CLAUDE.md#测试与发布)。

### 平台特定依赖

#### macOS
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

#### Windows
- **Visual Studio Build Tools 2022**（Rust MSVC 工具链编译需要）
  - 下载：https://visualstudio.microsoft.com/downloads/
  - 勾选「使用 C++ 的桌面开发」

#### Linux / WSL2
- Tauri 系统依赖（webkit2gtk 等），见 https://tauri.app/start/prerequisites/

---

## 安装步骤

### 1. 安装 Node.js（前端）

**推荐使用 nvm：**

macOS / Linux / WSL2:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 24 && nvm use 24
```

Windows: 下载 [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) 后 `nvm install 24 && nvm use 24`，或直接装 [Node.js LTS](https://nodejs.org/)。

### 2. 安装 Rust（后端）

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows: 下载 https://rustup.rs/ 的安装器
```

### 3. 验证环境

```bash
node -v        # v24.x.x
npm -v         # 10.x+
rustc --version  # 1.x
cargo --version
```

### 4. 克隆项目并安装依赖

```bash
git clone <repo-url>
cd Moneta
npm install     # 前端依赖（Rust 依赖在首次 cargo build / tauri dev 时拉取）
```

---

## 常见问题

### ❌ `tauri dev` 首次启动很慢

首次会编译整套 Rust 依赖（含 sqlite3mc amalgamation、aws-sdk），需几分钟；之后增量编译很快。

### ❌ Windows `link.exe not found` / MSVC 缺失

安装 Visual Studio Build Tools 2022，勾选「使用 C++ 的桌面开发」。

### ❌ 数据库打不开 / 钥匙串授权弹窗

首启会从旧 Electron 数据迁移密钥到 OS keyring，macOS 会弹钥匙串授权——选「始终允许」。开发期想保护真实数据，用 `MONETA_DATA_DIR=/tmp/xxx` 指向临时目录。

---

## 开发命令

```bash
# 启动开发环境
npm run dev:tauri

# 打包（macOS DMG / Windows NSIS）
npm run tauri build

# 代码检查
npm run typecheck                          # 前端 TS 类型检查
cd src-tauri && cargo clippy --workspace   # Rust lint

# 测试
npm run test                               # 前端 vitest
cd src-tauri && MONETA_KEYRING=mock cargo test  # Rust 测试
```

---

## 环境迁移指南

### 换新电脑时

1. **确保已安装**：Git、Node.js 24+、Rust（rustup）
2. **克隆项目**：
   ```bash
   git clone <repo-url> && cd Moneta
   ```
3. **运行自动化脚本**：
   ```bash
   bash scripts/setup-env.sh   # macOS/Linux/WSL2
   scripts\setup-env.bat       # Windows
   ```
4. **开始开发**：`npm run dev:tauri`

### 版本锁定文件说明

| 文件 | 作用 |
|------|------|
| `.nvmrc` | Node.js 主版本锁定（`24`） |
| `package.json` engines | Node.js 版本范围（`>=24.0.0`） |
| `package-lock.json` | npm 依赖精确锁定 |
| `src-tauri/Cargo.lock` | Rust 依赖精确锁定 |

---

## 编辑器配置

推荐使用 **VSCode** + 以下插件：
- ESLint
- Prettier
- TypeScript and JavaScript Language Features

配置文件已包含在项目中：
- `.vscode/settings.json`
- `.vscode/extensions.json`

---

## 技术支持

遇到问题？
1. 查看上面的「常见问题」
2. 运行环境检查脚本查看详细错误
3. 提交 Issue（附上错误日志）

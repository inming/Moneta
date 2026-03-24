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
| **Node.js** | 24+ (LTS) | 锁定主版本，允许小版本更新 |
| **npm** | 10.x+ | 随 Node.js 安装 |
| **Python** | 3.x | 推荐 3.11+，需要安装 setuptools |
| **setuptools** | - | Python 包，编译原生模块必需 |
| **Git** | 2.x+ | 版本控制 |

### 平台特定依赖

#### macOS
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

#### Windows
- **Visual Studio Build Tools 2022**
  - 下载：https://visualstudio.microsoft.com/downloads/
  - 勾选「使用 C++ 的桌面开发」
  - 或运行：`npm install -g windows-build-tools`

- **Python setuptools**（必需）
  ```cmd
  pip install setuptools
  ```

#### Linux / WSL2
- **build-essential**
  ```bash
  sudo apt-get install build-essential
  ```

---

## 安装步骤

### 1. 安装 Node.js

**推荐使用 nvm（版本管理器）：**

macOS / Linux / WSL2:
```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重启终端后
nvm install 24
nvm use 24
```

Windows:
```cmd
# 下载 nvm-windows: https://github.com/coreybutler/nvm-windows/releases
# 安装后运行:
nvm install 24
nvm use 24
```

**或直接下载最新 LTS：**
- https://nodejs.org/ (下载 LTS 版本)

### 2. 安装 Python 和 setuptools

**macOS (Homebrew):**
```bash
brew install python
pip3 install setuptools
```

**Windows:**
- 下载：https://www.python.org/downloads/
- 勾选「Add Python to PATH」
- 安装完成后运行：
  ```cmd
  pip install setuptools
  ```

**Linux / WSL2:**
```bash
sudo apt-get update
sudo apt-get install python3 python3-pip
pip3 install setuptools
```

### 3. 验证环境

```bash
# Node.js
node -v     # 应显示 v24.x.x

# npm
npm -v      # 应显示 10.x+

# Python
python --version    # 应显示 Python 3.x

# setuptools
python -c "import setuptools; print(setuptools.__version__)"
```

### 4. 克隆项目并安装依赖

```bash
git clone <repo-url>
cd Moneta
npm install
```

---

## 常见问题

### ❌ `ModuleNotFoundError: No module named 'distutils'`

**原因**：缺少 setuptools 包

**解决**：
```bash
# 安装 setuptools
pip install setuptools

# 或使用 pip3
pip3 install setuptools
```

### ❌ `gyp ERR! find VS` (Windows)

**原因**：缺少 Visual Studio Build Tools

**解决**：
1. 安装 Visual Studio 2022 Community
2. 勾选「使用 C++ 的桌面开发」
3. 或运行：`npm install -g windows-build-tools`

### ❌ `better-sqlite3` 编译失败

**解决**：
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install

# Windows:
rmdir /s /q node_modules
del package-lock.json
npm install
```

### ❌ `EACCES` 权限错误 (macOS/Linux)

**解决**：
```bash
# 修复 npm 权限
sudo chown -R $(whoami) ~/.npm
```

---

## 开发命令

```bash
# 启动开发环境
npm run dev

# 构建
npm run build

# 打包
npm run package          # 当前平台
npm run package:mac      # macOS DMG
npm run package:win      # Windows NSIS

# 代码检查
npm run lint             # ESLint
npm run typecheck        # TypeScript 类型检查

# 测试
npm run test             # 运行测试
npm run test:watch       # 监听模式
```

---

## 环境迁移指南

### 换新电脑时

1. **确保已安装**：
   - Git
   - Node.js 24+（通过 nvm 或直接安装 LTS）
   - Python 3.x + setuptools

2. **克隆项目**：
   ```bash
   git clone <repo-url>
   cd Moneta
   ```

3. **运行自动化脚本**：
   ```bash
   # macOS/Linux/WSL2
   bash scripts/setup-env.sh

   # Windows
   scripts\setup-env.bat
   ```

4. **开始开发**：
   ```bash
   npm run dev
   ```

### 版本锁定文件说明

| 文件 | 作用 |
|------|------|
| `.nvmrc` | Node.js 主版本锁定（`24`），nvm 自动读取最新的 24.x |
| `package.json` engines | Node.js 版本范围要求（`>=24.0.0`） |
| `package-lock.json` | npm 依赖精确版本锁定 |

**注**：
- Node.js 只锁定主版本号，允许获取安全更新和小版本改进
- Python 版本不锁定，但需要安装 setuptools 包

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

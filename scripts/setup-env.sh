#!/bin/bash
# Moneta 开发环境自动配置脚本
# 适用于 macOS 和 Linux (WSL2)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "  Moneta 开发环境配置"
echo "========================================"
echo ""

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo "🍎 检测到 macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qi microsoft /proc/version; then
        OS="wsl"
        echo "🐧 检测到 WSL2"
    else
        OS="linux"
        echo "🐧 检测到 Linux"
    fi
else
    echo -e "${RED}❌ 不支持的操作系统: $OSTYPE${NC}"
    exit 1
fi

echo ""

# 1. 检查 Node.js
echo "📦 检查 Node.js..."
REQUIRED_NODE_MAJOR=$(cat "$PROJECT_ROOT/.nvmrc")

if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node -v | sed 's/v//')
    CURRENT_NODE_MAJOR=$(echo "$CURRENT_NODE_VERSION" | cut -d. -f1)

    echo "   当前版本: v$CURRENT_NODE_VERSION"
    echo "   需要版本: v${REQUIRED_NODE_MAJOR}.x (LTS)"

    if [[ "$CURRENT_NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]]; then
        echo -e "${YELLOW}⚠️  Node.js 版本过低（需要 v${REQUIRED_NODE_MAJOR}+）${NC}"

        if command -v nvm &> /dev/null; then
            echo "   使用 nvm 安装 Node.js ${REQUIRED_NODE_MAJOR}..."
            nvm install "$REQUIRED_NODE_MAJOR"
            nvm use "$REQUIRED_NODE_MAJOR"
        else
            echo -e "${RED}   请安装 nvm 或手动安装 Node.js ${REQUIRED_NODE_MAJOR}+ LTS${NC}"
            echo "   nvm: https://github.com/nvm-sh/nvm"
            echo "   或直接下载: https://nodejs.org/"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Node.js 版本符合要求${NC}"
    fi
else
    echo -e "${RED}❌ 未找到 Node.js${NC}"
    echo "   请安装 Node.js ${REQUIRED_NODE_MAJOR}+ LTS"
    echo "   推荐使用 nvm: https://github.com/nvm-sh/nvm"
    exit 1
fi

echo ""

# 2. 检查 Rust 工具链（Tauri 后端 + MCP sidecar）
echo "🦀 检查 Rust..."

if command -v cargo &> /dev/null; then
    echo "   当前版本: $(rustc --version)"
    echo -e "${GREEN}✅ Rust 已安装${NC}"
else
    echo -e "${RED}❌ 未找到 Rust（cargo）${NC}"
    echo "   请安装 Rust（rustup）："
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo ""

# 3. 平台特定依赖
if [[ "$OS" == "macos" ]]; then
    echo "🍎 检查 macOS 依赖..."

    if ! command -v brew &> /dev/null; then
        echo -e "${YELLOW}⚠️  未安装 Homebrew，强烈建议安装${NC}"
        echo "   安装命令: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    else
        echo -e "${GREEN}✅ Homebrew 已安装${NC}"
    fi
fi

echo ""

# 4. 安装 npm 依赖
echo "📦 安装 npm 依赖..."
cd "$PROJECT_ROOT"

if [[ ! -d "node_modules" ]]; then
    echo "   首次安装..."
    npm install
else
    echo "   依赖已存在，检查更新..."
    npm install
fi

echo ""
echo -e "${GREEN}========================================"
echo "  ✅ 环境配置完成！"
echo "========================================${NC}"
echo ""
echo "🚀 可以开始开发了："
echo "   npm run dev:tauri    # 启动开发环境（Tauri）"
echo "   npm run tauri build  # 打包（macOS DMG / Windows NSIS）"
echo "   cd src-tauri && cargo test  # Rust 测试"
echo ""

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

# 2. 检查 Python 和 setuptools
echo "🐍 检查 Python..."

if command -v python3 &> /dev/null; then
    CURRENT_PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    echo "   当前版本: $CURRENT_PYTHON_VERSION"
    echo -e "${GREEN}✅ Python 已安装${NC}"

    # 检查 setuptools（编译原生模块需要）
    echo "   检查 setuptools..."
    if ! python3 -c "import setuptools" &> /dev/null; then
        echo -e "${YELLOW}⚠️  setuptools 未安装${NC}"
        echo "   正在安装 setuptools..."
        pip3 install setuptools
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ setuptools 安装成功${NC}"
        else
            echo -e "${RED}❌ setuptools 安装失败${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ setuptools 已安装${NC}"
    fi
else
    echo -e "${RED}❌ 未找到 Python3${NC}"
    echo "   请安装 Python 3.x"
    echo "   推荐版本: Python 3.11+"
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
echo "   npm run dev          # 启动开发环境"
echo "   npm run build        # 构建"
echo "   npm run package:mac  # 打包 macOS"
echo "   npm run package:win  # 打包 Windows"
echo ""

#!/bin/bash
# =============================================================================
# 一键同步 WSL2 代码到 Windows 目录（单向同步）
# =============================================================================

set -e

# 从参数或环境变量读取
WIN_PATH="${1:-$WIN_PATH}"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $(basename $0) [WINDOWS_PATH]"
    echo ""
    echo "同步 WSL2 代码到 Windows 目录"
    echo ""
    echo "参数:"
    echo "  WINDOWS_PATH    Windows 目标路径"
    echo "                  也可通过环境变量 WIN_PATH 设置"
    echo ""
    echo "示例:"
    echo "  $(basename $0) /mnt/c/Users/<username>/workspace/Moneta"
    echo "  $(basename $0) /mnt/d/Moneta"
    echo "  export WIN_PATH=/mnt/d/Moneta && $(basename $0)"
    echo ""
    echo "环境变量:"
    echo "  WIN_PATH        设置默认目标路径"
    exit 0
fi

# 检查路径
if [ -z "$WIN_PATH" ]; then
    echo -e "${RED}错误: 未指定目标路径${NC}"
    echo ""
    echo "使用方法: $(basename $0) WINDOWS_PATH"
    echo "或设置环境变量: export WIN_PATH=/mnt/c/Users/<username>/workspace/Moneta"
    echo ""
    echo "示例:"
    echo "  $(basename $0) /mnt/c/Users/<username>/workspace/Moneta"
    echo "  $(basename $0) /mnt/d/Moneta"
    exit 1
fi

# 获取仓库根目录
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo -e "${RED}错误: 当前目录不是 git 仓库${NC}"
    exit 1
}

echo -e "${BLUE}同步到 Windows: $WIN_PATH${NC}"
echo "源: $REPO_ROOT"
echo ""

# 检查目标目录是否存在
if [ ! -d "$WIN_PATH" ]; then
    echo -e "${YELLOW}警告: 目标目录不存在${NC}"
    read -p "是否创建? (y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mkdir -p "$WIN_PATH"
    else
        exit 1
    fi
fi

# 执行同步
# -a: 归档模式
# -c: 基于内容判断，避免时间戳差异
# --no-times: 不修改目标时间戳
# --no-perms: 不修改目标权限
# --exclude: 排除不需要的文件
rsync -avc --no-times --no-perms \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=out \
    --exclude=dist \
    --exclude=*.log \
    --exclude=.vscode \
    --exclude=scripts \
    --exclude=.docker-home \
    --exclude=.npm \
    "$REPO_ROOT/" \
    "$WIN_PATH/"

echo ""
echo -e "${GREEN}✓ 同步完成${NC}"

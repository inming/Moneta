# =============================================================================
# Windows 端代码重置脚本
# 用途：测试完成后，恢复到最新的 Git 版本（丢弃所有本地改动）
# =============================================================================

# 设置错误时停止执行
$ErrorActionPreference = "Stop"

# 颜色函数
function Write-Color {
    param(
        [string]$Text,
        [string]$Color = "White"
    )
    Write-Host $Text -ForegroundColor $Color
}

# 显示标题
Write-Color "`n=== Windows 端代码重置工具 ===" "Cyan"
Write-Color "当前目录: $(Get-Location)`n" "Gray"

# 检查是否在 Git 仓库中
if (-not (Test-Path ".git")) {
    Write-Color "错误: 当前目录不是 Git 仓库" "Red"
    Write-Color "请在项目根目录下运行此脚本`n" "Yellow"
    pause
    exit 1
}

# 显示当前状态
Write-Color "查看当前改动..." "Blue"
git status --short

# 询问确认
Write-Color "`n警告: 此操作将丢弃所有未提交的改动！" "Yellow"
Write-Color "包括:" "Yellow"
Write-Color "  - 所有修改的文件" "Yellow"
Write-Color "  - 所有未跟踪的文件和目录" "Yellow"
Write-Color "  - 所有暂存的改动`n" "Yellow"

$confirm = Read-Host "确认继续? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Color "已取消操作`n" "Gray"
    pause
    exit 0
}

# 1. 重置所有改动
Write-Color "`n[1/4] 重置所有改动..." "Blue"
git reset --hard HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Color "错误: git reset 失败" "Red"
    pause
    exit 1
}
Write-Color "✓ 已重置到最新提交" "Green"

# 2. 清理未跟踪的文件
Write-Color "`n[2/4] 清理未跟踪的文件..." "Blue"
$cleanBuild = Read-Host "是否清理构建产物 (out/dist)? (y/N)"
if ($cleanBuild -eq 'y' -or $cleanBuild -eq 'Y') {
    # 清理构建产物，但保留 node_modules
    git clean -fd -e node_modules
    if ($LASTEXITCODE -ne 0) {
        Write-Color "错误: git clean 失败" "Red"
        pause
        exit 1
    }
    Write-Color "✓ 已清理所有未跟踪的文件（已保留 node_modules/）" "Green"
} else {
    # 清理未跟踪的文件，但保留 out/、dist/ 和 node_modules/
    git clean -fd -e out -e dist -e node_modules
    if ($LASTEXITCODE -ne 0) {
        Write-Color "错误: git clean 失败" "Red"
        pause
        exit 1
    }
    Write-Color "✓ 已清理未跟踪的文件（已保留 out/、dist/、node_modules/）" "Green"
}

# 3. 拉取最新代码（如果有远程仓库）
Write-Color "`n[3/4] 拉取最新代码..." "Blue"
$hasRemote = git remote | Where-Object { $_ -eq "origin" }
if ($hasRemote) {
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Color "警告: git pull 失败（可能没有远程分支）" "Yellow"
    } else {
        Write-Color "✓ 已拉取最新代码" "Green"
    }
} else {
    Write-Color "跳过（无远程仓库）" "Gray"
}

# 4. 询问是否重新安装依赖
Write-Color "`n[4/4] 是否重新安装依赖?" "Blue"
$installDeps = Read-Host "执行 npm install? (y/N)"
if ($installDeps -eq 'y' -or $installDeps -eq 'Y') {
    Write-Color "安装依赖中..." "Blue"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Color "错误: npm install 失败" "Red"
        pause
        exit 1
    }
    Write-Color "✓ 依赖安装完成" "Green"
} else {
    Write-Color "跳过依赖安装" "Gray"
}

# 完成
Write-Color "`n=== 重置完成 ===" "Cyan"
Write-Color "当前状态:" "Blue"
git status --short
Write-Color "`n代码已恢复到最新版本`n" "Green"

pause

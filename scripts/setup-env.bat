@echo off
REM Moneta 开发环境自动配置脚本（Windows）
setlocal enabledelayedexpansion

echo ========================================
echo   Moneta 开发环境配置 (Windows)
echo ========================================
echo.

REM 检查 Node.js
echo 检查 Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js
    echo 请从 https://nodejs.org/ 下载并安装 Node.js 24+ LTS
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo    当前版本: %NODE_VERSION%
echo    需要版本: v24+ (LTS)
echo    [成功] Node.js 已安装
echo.

REM 检查 Rust 工具链（Tauri 后端 + MCP sidecar）
echo 检查 Rust...
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Rust (cargo)
    echo 请从 https://rustup.rs/ 安装 Rust
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('rustc --version') do set RUST_VERSION=%%i
echo    当前版本: %RUST_VERSION%
echo    [成功] Rust 已安装
echo.

REM 检查 Visual Studio Build Tools（Rust MSVC 工具链编译需要）
echo 检查 Visual Studio Build Tools...
where cl.exe >nul 2>nul
if %errorlevel% neq 0 (
    echo [警告] 未找到 Visual Studio Build Tools
    echo    Rust MSVC 工具链编译需要此工具
    echo.
    echo    请安装以下之一:
    echo    1. Visual Studio 2022 Community (勾选"使用 C++ 的桌面开发")
    echo    2. Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
    echo.
    set /p CONTINUE="是否继续安装 npm 依赖? (y/n): "
    if /i not "!CONTINUE!"=="y" (
        exit /b 0
    )
) else (
    echo    [成功] Visual Studio Build Tools 已安装
)
echo.

REM 安装 npm 依赖
echo 安装 npm 依赖...
cd /d "%~dp0\.."

if not exist "node_modules" (
    echo    首次安装...
    npm install
) else (
    echo    依赖已存在，检查更新...
    npm install
)

if %errorlevel% neq 0 (
    echo.
    echo [错误] npm 依赖安装失败
    echo.
    echo 常见问题排查:
    echo 1. 确保已安装 Rust (rustup) 与 Visual Studio Build Tools
    echo 2. 清理后重试: rmdir /s /q node_modules ^&^& del package-lock.json ^&^& npm install
    pause
    exit /b 1
)

echo.
echo ========================================
echo   环境配置完成！
echo ========================================
echo.
echo 可以开始开发了:
echo    npm run dev:tauri    # 启动开发环境（Tauri）
echo    npm run tauri build  # 打包（Windows NSIS）
echo.
pause

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

REM 检查 Python
echo 检查 Python...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python
    echo 请从 https://www.python.org/downloads/ 下载并安装 Python 3.x
    echo 推荐版本: Python 3.11+
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo    当前版本: %PYTHON_VERSION%
echo    [成功] Python 已安装
echo.

REM 检查 setuptools（编译原生模块需要）
echo 检查 setuptools...
python -c "import setuptools" >nul 2>nul
if %errorlevel% neq 0 (
    echo    [警告] setuptools 未安装
    echo    正在安装 setuptools...
    pip install setuptools
    if %errorlevel% neq 0 (
        echo    [错误] setuptools 安装失败
        pause
        exit /b 1
    )
    echo    [成功] setuptools 已安装
) else (
    echo    [成功] setuptools 已安装
)
echo.

REM 检查 Visual Studio Build Tools（编译原生模块需要）
echo 检查 Visual Studio Build Tools...
where cl.exe >nul 2>nul
if %errorlevel% neq 0 (
    echo [警告] 未找到 Visual Studio Build Tools
    echo    better-sqlite3 等原生模块编译需要此工具
    echo.
    echo    请安装以下之一:
    echo    1. Visual Studio 2022 Community (勾选"使用 C++ 的桌面开发")
    echo    2. Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
    echo.
    echo    或者运行: npm install -g windows-build-tools
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
    echo 1. 确保 Python 版本为 3.11.x (不要用 3.12+)
    echo 2. 确保已安装 Visual Studio Build Tools
    echo 3. 运行: pip install setuptools
    echo 4. 清理后重试: rmdir /s /q node_modules ^&^& del package-lock.json ^&^& npm install
    pause
    exit /b 1
)

echo.
echo ========================================
echo   环境配置完成！
echo ========================================
echo.
echo 可以开始开发了:
echo    npm run dev          # 启动开发环境
echo    npm run build        # 构建
echo    npm run package:win  # 打包 Windows
echo.
pause

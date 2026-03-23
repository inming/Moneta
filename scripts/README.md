# Scripts

此目录存放开发辅助脚本。

## 脚本列表

| 脚本 | 说明 |
|------|------|
| `sync-to-windows.sh` | 将 WSL2 代码同步到 Windows 目录，用于在 Windows 上运行调试 |

## sync-to-windows.sh

### 用途

在 WSL2 中编辑代码，但需要到 Windows 上运行测试（Electron 需要 Windows 原生依赖）。

### 使用

```bash
# 指定路径
./scripts/sync-to-windows.sh /mnt/c/Users/<username>/workspace/Moneta

# 或设置环境变量
export WIN_PATH=/mnt/c/Users/<username>/workspace/Moneta
./scripts/sync-to-windows.sh
```

### Windows 端准备（只需一次）

```powershell
cd C:\Users\<username>\workspace\Moneta  # 替换为你的实际路径
npm install
```

### 同步后运行

```powershell
cd C:\Users\<username>\workspace\Moneta  # 替换为你的实际路径
npm run dev
```

### 说明

- 同步时排除：`node_modules/`、`dist/`、`out/`、`.git/`、`.vscode/`、`scripts/`、`*.log`
- Windows 的依赖和构建产物不会被覆盖

# MCP (Model Context Protocol) 架构

> 从 CLAUDE.md 拆分。修改 MCP Server、HTTP Server、MCP 配置或导入流程时请先阅读本文档。

## 整体架构

MCP 功能采用**分离式架构**：MCP Server 作为独立进程通过 stdio 与 Claude Desktop 通信，通过 HTTP 与 Moneta 主应用通信。

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │ ←→  │   MCP Server    │ ←→  │  Moneta Main    │
│   (stdio)       │     │  (stdio + HTTP) │     │  (HTTP Server)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                               ┌────────┴────────┐
                                               ↓                 ↓
                                          ┌─────────┐      ┌──────────┐
                                          │ SQLite  │      │ Import   │
                                          │   DB    │      │ Confirm  │
                                          └─────────┘      └──────────┘
```

## 组件职责

| 组件 | 路径 | 职责 |
|------|------|------|
| MCP Server | `src/mcp/` | stdio 模式 MCP 服务器，暴露 3 个 tools |
| MCP HTTP Client | `src/mcp/http-client.ts` | MCP Server 向主应用查询数据的 HTTP 客户端 |
| MCP HTTP Server | `src/main/services/mcp-http-server.ts` | 主应用内的 HTTP 服务器，端口可配置 |
| MCP Config Service | `src/main/services/mcp-config.service.ts` | Claude Desktop 配置管理、端口配置 |
| MCP Config IPC | `src/main/ipc/mcp-config.ipc.ts` | 配置相关 IPC 处理器 |
| MCP Import IPC | `src/main/ipc/mcp-import.ipc.ts` | 导入请求处理、渲染进程通知 |
| ImportConfirm | `src/renderer/src/components/ImportConfirm/` | 共享导入确认组件（AI 识别和 MCP 共用） |
| MCP Import Page | `src/renderer/src/pages/MCPImport/` | MCP 导入确认页面 |
| MCP Config UI | `src/renderer/src/pages/Settings/MCPConfigManager.tsx` | MCP 配置界面 |

## Tools 列表

| Tool | 功能 | 对应 HTTP 端点 |
|------|------|----------------|
| `get_categories` | 获取分类列表 | `GET /api/categories` |
| `get_operators` | 获取操作人列表 | `GET /api/operators` |
| `send_transactions` | 发送交易数据打开确认界面 | `POST /mcp-import` |

## HTTP 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/categories` | GET | 查询所有分类（可选 `?type=expense` 筛选） |
| `/api/operators` | GET | 查询所有操作人 |
| `/mcp-import` | POST | 接收交易数据，通知渲染进程打开确认界面 |

## 端口配置机制

**默认端口**：9615（范围 1025-65535）

**配置存储**：`app.getPath('userData')/mcp-config.json`

**环境变量传递**：
- 写入 `claude_desktop_config.json` 时，将端口放入 `env.MONETA_MCP_PORT`
- MCP Server 启动时从环境变量读取端口，默认 9615

```typescript
// 配置写入
const serverConfig = {
  command: 'node',
  args: [mcpServerPath, '--mcp'],
  env: { MONETA_MCP_PORT: String(port) }
}

// MCP Server 读取
const MCP_HTTP_PORT = process.env.MONETA_MCP_PORT
  ? parseInt(process.env.MONETA_MCP_PORT, 10)
  : 9615
```

## 端口变更处理流程

1. 用户在设置页修改端口 → 保存到 `mcp-config.json`
2. 点击「配置 Claude Desktop」时：
   - 检测当前运行端口 vs 配置端口
   - 不一致则先 `stop()` 再 `start()` 重启 HTTP Server
   - 将新端口写入 `claude_desktop_config.json` 的 `env`
3. 提示用户重启 Claude Desktop
4. MCP Server 重启后读取新端口的环境变量

## 共享导入确认组件

AI 图片识别和 MCP 导入共用 `ImportConfirm` 组件：

```
┌─────────────────┐      ┌─────────────────┐
│  AI Recognition │ ───→ │                 │
│  (/ai-recognition)│     │  ImportConfirm  │ ──→ 数据库
│                 │      │  (Component)    │
│  MCP Import     │ ───→ │                 │
│  (/mcp-import)  │      │                 │
└─────────────────┘      └─────────────────┘
```

**差异处理**：
- AI 识别：日期由页面顶部选择器统一指定，表格中不显示日期列
- MCP 导入：每行独立日期字段，表格显示日期列
- 通过 `showDateColumn` prop 控制列显隐

## IPC 通道（MCP 相关）

| 通道 | 方向 | 用途 |
|------|------|------|
| `mcp:status` | invoke | 获取 MCP 配置状态 |
| `mcp:configure` | invoke | 配置 Claude Desktop |
| `mcp:http-server:start` | invoke | 启动 HTTP Server |
| `mcp:http-server:stop` | invoke | 停止 HTTP Server |
| `mcp:http-server:status` | invoke | 获取 HTTP Server 状态 |
| `mcp:port:update` | invoke | 更新端口配置 |
| `mcp:import:request` | on | 监听 MCP 导入请求，打开确认界面 |
| `mcp:import:confirm` | invoke | 确认导入，写入数据库 |
| `mcp:import:cancel` | invoke | 取消导入 |

## MCP Server 入口

- **开发环境**：`node out/main/mcp.js --mcp`
- **生产环境**：`node <app>/out/main/mcp.js --mcp`
- 通过 `getMCPServerPath()` 动态解析路径，支持 asar 打包场景

## 配置文件位置

| 平台 | Claude Desktop 配置路径 |
|------|------------------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%/Claude/claude_desktop_config.json` |

## 状态标识

**HTTP Server 状态**（界面显示）：
- 运行中：绿色 Tag
- 已停止：黄色 Tag

**Claude Desktop 配置状态**：
- 已配置：绿色 Tag（`moneta` 存在于 `mcpServers`）
- 未配置：黄色 Tag

## 代码约定

**MCP Server 代码组织**（`src/mcp/`）：
- `index.ts`：入口，stdio 模式检测， graceful shutdown 处理
- `server.ts`：`MonetaMcpServer` 类，MCP 协议实现
- `http-client.ts`：HTTP 客户端，供 tools 调用
- `types.ts`：MCP 相关类型定义
- `tools/`：各 tool 的实现，每个文件导出 `name`、`description`、`inputSchema`、`handler`

**Tool 实现模式**：
```typescript
export const name = 'tool_name'
export const description = '工具描述，供 AI 理解用途'
export const inputSchema = { /* JSON Schema */ }
export async function handler(params: Params): Promise<Result> {
  // 实现
}
```

**HTTP Server 类设计**：
- 单例模式（`mcpHttpServer` 实例导出）
- 状态监听：`addStatusListener()` / `removeStatusListener()`
- 端口管理：`getPort()` / `getConfiguredPort()` / `setPort()` / `isRunning()`
- 生命周期：`start()` / `stop()` / `restart()`

## MCP Skill 文档

AI 助手使用指南位于 `resources/skills/mcp-moneta-import.md`：
- 工具使用流程说明
- 分类匹配示例表
- 日期/金额格式转换规范
- 错误处理建议

---

**相关文档**：
- 产品规格：`docs/prd-archive/mcp-spec.md`
- Skill 文档：`resources/skills/mcp-moneta-import.md`
- 总体架构：`docs/ARCHITECTURE.md`

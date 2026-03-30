# MCP 账单导入助手 — 功能规格归档
> 从 PRD.md Section 6 归档。此功能已实现（v0.5）。

## 6. MCP 账单导入助手（v0.5）

### 6.1 功能概述

MCP（Model Context Protocol）账单导入助手允许用户通过 AI 助手（如 Claude）直接与应用交互，分析本地 Excel/CSV 文件内容并智能导入交易数据。用户无需手动处理 Excel 格式转换，只需将文件路径提供给 AI，AI 将自动分析数据结构、识别字段映射，并生成符合 Moneta 格式的交易记录供用户确认后入库。

### 6.2 使用场景

1. **历史账单迁移**：用户有多年前不同格式的 Excel 记账文件，通过 AI 助手描述文件结构，AI 自动解析并映射到 Moneta 字段
2. **第三方导出文件导入**：用户从银行 App、支付宝、微信等导出的账单 CSV，AI 自动识别日期格式、金额正负含义、交易类型等
3. **复杂数据清洗**：原始数据包含冗余列、混合多种交易类型，AI 辅助智能分类和清洗
4. **批量格式转换**：多个不同格式的旧账单文件，一次性通过 AI 分析并统一导入

### 6.3 功能架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   用户对话界面   │ ←→  │   AI 助手        │ ←→  │  MCP Server     │
│  (Claude 等)    │     │  (Claude Desktop)│     │  (Moneta 内置)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌─────────────────┐            │
                        │   数据确认界面   │ ←─────────┘
                        │ (类似 AI 识别页) │
                        └─────────────────┘
                                │
                                ↓
                        ┌─────────────────┐
                        │   批量写入数据库 │
                        └─────────────────┘
```

### 6.4 MCP Server 能力

Moneta 应用内置 MCP Server，通过 **stdio 模式** 与 Claude Desktop 通信。暴露以下工具（Tools）供 AI 调用。

**假设**：AI 助手（如 Claude Desktop）能够直接读取用户本地文件，MCP 只负责「接收转换好的数据并展示确认界面」这一环节。

#### 6.4.0 MCP Server 注册方式

**推荐方式：应用内一键配置（半自动）**

Moneta 设置页「AI 模型」Tab 中提供「配置 Claude Desktop MCP」按钮：

1. 用户点击按钮
2. Moneta 自动检测 Claude Desktop 配置文件位置：
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`
3. Moneta 将 MCP Server 配置写入该文件：

```json
{
  "mcpServers": {
    "moneta": {
      "command": "/Applications/Moneta.app/Contents/MacOS/moneta-mcp",
      "args": ["--mcp"],
      "env": {}
    }
  }
}
```

4. 提示用户重启 Claude Desktop 以生效

**备用方式：手动配置**

如果自动配置失败或用户偏好手动，提供配置指引：

```markdown
1. 打开 Claude Desktop → Settings → Developer → Edit Config
2. 在 claude_desktop_config.json 中添加：

{
  "mcpServers": {
    "moneta": {
      "command": "<Moneta安装路径>/moneta-mcp",
      "args": ["--mcp"]
    }
  }
}

3. 重启 Claude Desktop
```

**MCP Server 启动模式**

- Moneta 主应用与 MCP Server 分离，避免 stdio 通信阻塞主进程
- 打包时单独输出 `moneta-mcp` 可执行文件（或 Node.js 脚本）
- `moneta-mcp --mcp` 启动时，通过 stdio 与 Claude Desktop 通信，支持 MCP 协议
- MCP Server 需要与主应用通信获取分类、操作人等数据，可通过本地 HTTP 或文件 socket

#### 6.4.1 工具列表

| 工具名称 | 功能 | 参数 |
|---------|------|------|
| `get_categories` | 获取当前分类列表（供 AI 智能匹配） | `type`: 可选，筛选特定类型（expense/income/investment） |
| `get_operators` | 获取现有操作人列表 | - |
| `send_transactions` | AI 将转换好的交易数据发送给 Moneta | `transactions`: 交易记录数组（见下方格式）<br>`source`: 数据来源描述（如 "招商银行账单 2024-01"） |

每个工具的 `description` 字段应清晰说明用途和使用场景，供 AI 助手理解何时调用。详见 §6.6 MCP Skill 文档。

#### 6.4.2 工具返回格式

**`get_categories` 返回格式**：

```typescript
[
  {
    "id": 1,
    "name": "正餐",
    "type": "expense",
    "description": "外卖、堂食、食堂、餐厅",  // AI 描述字段，辅助 AI 理解分类含义
    "sort_order": 1
  }
]
```

> **注意**：`description` 字段是分类的「AI 描述」，用于帮助 AI 助手更准确地匹配分类。如 "外卖、堂食、食堂、餐厅" 提示 AI 看到外卖订单时应匹配到「正餐」分类。

**`get_operators` 返回格式**：

```typescript
[
  {
    "id": 1,
    "name": "本人"
  }
]
```

#### 6.4.3 交易数据格式

AI 调用 `send_transactions` 时，`transactions` 数组每项格式如下：

```typescript
{
  date: string;           // 日期，格式 YYYY-MM-DD
  type: "expense" | "income" | "investment";
  amount: number;         // 金额，正数
  category_id?: number;   // 分类 ID（AI 可提前匹配，也可留空让用户选择）
  category_name?: string; // 分类名称（用于显示，category_id 为空时 AI 可建议）
  description: string;    // 描述
  operator_id?: number;   // 操作人 ID（可选）
  operator_name?: string; // 操作人名称（可选，用于显示）
}
```

**说明**：
- AI 读取文件后自行完成字段映射、日期格式转换、金额解析、分类匹配
- `category_id` 和 `operator_id` 可通过 `get_categories` / `get_operators` 获取后匹配
- AI 匹配分类时，应结合 `name` 和 `description` 字段进行语义匹配
- 如果 AI 不确定分类，可以只填 `category_name` 作为建议，或留空由用户在确认界面选择

### 6.5 导入流程

#### 6.5.1 AI 处理阶段（在 AI 助手端完成）

1. 用户提供文件路径和内容给 AI 助手（通过对话粘贴或 AI 直接读取本地文件）
2. AI 分析文件内容，完成以下转换：
   - 解析日期字段并统一格式化为 `YYYY-MM-DD`
   - 解析金额（处理正负号、货币符号、千分号等）
   - 判断交易类型（收入/支出/投资）
   - 调用 `get_categories` 获取分类列表，智能匹配分类（如 "美团外卖" → "正餐"）
   - 组装描述文本
3. AI 生成符合 Moneta 格式的交易记录数组

#### 6.5.2 发送数据阶段

AI 调用 `send_transactions` 工具，将转换好的数据发送给 Moneta：

```json
{
  "transactions": [
    {
      "date": "2024-01-15",
      "type": "expense",
      "amount": 128.50,
      "category_name": "正餐",
      "description": "美团外卖 - 午餐",
      "operator_name": "本人"
    }
  ],
  "source": "支付宝账单 2024年1月"
}
```

#### 6.5.3 预览确认阶段

1. Moneta 收到数据后，自动打开「MCP 导入确认界面」（复用 AI 图片识别确认页，路由 `/mcp-import`）
2. 界面展示：
   - 数据来源（`source` 字段）
   - 共 N 条待导入记录
   - 分类已匹配 M 条，待确认 P 条
3. 用户在界面中完成最终编辑：
   - 修改任意字段
   - 删除不需要的行
   - 插入新行
   - 为未匹配分类的行选择分类（红色高亮提示）

#### 6.5.4 执行导入阶段

1. 用户点击「确认导入」后，数据批量写入数据库
2. 显示导入结果：成功 N 条
3. 界面自动关闭或返回数据浏览页

### 6.6 数据确认界面

复用 AI 图片识别的确认界面组件，显示以下信息：

| 元素 | 说明 |
|------|------|
| 导入摘要 | 共 N 条，待补充分类 M 条，已智能匹配分类 P 条 |
| 全局操作人 | **初始为空**，用户必须选择后才能提交；选择后所有行同步更新 |
| 记账日期 | **初始为空**（即使 MCP 数据携带日期也清空），用户必须手动确认日期后才能提交 |
| 可编辑表格 | 同 AI 识别确认页，支持行内编辑、插入、删除 |
| 分类高亮 | 未匹配到分类的行红色高亮 |
| 提交校验 | 分类为空、日期未选择、操作人未选择时均阻止提交 |

### 6.7 与 AI 图片识别的差异

| 维度 | AI 图片识别 | MCP 账单导入 |
|------|------------|-------------|
| 数据来源 | 图片（截图/照片） | 本地 Excel/CSV 文件 |
| AI 角色 | 提取图片中的交易信息 | 分析文件结构、智能映射字段 |
| 识别精度 | 依赖图片质量和 OCR | 依赖文件结构化程度 |
| 分类匹配 | AI 根据描述建议分类 | AI 根据规则映射 + 智能匹配 |
| 进入方式 | 数据浏览页「图片识别导入」按钮 | AI 助手主动调用 MCP 触发 |
| 确认界面 | 独立的 `/ai-recognition` 页面 | 复用相同组件，路由 `/mcp-import` |

### 6.8 安全与权限

1. **文件访问白名单**：MCP Server 仅允许访问用户明确指定的文件路径（通过对话框选择后传入）
2. **执行确认**：`execute_import` 调用前必须通过确认界面获得用户明确授权
3. **沙箱限制**：MCP Server 仅暴露必要的只读和受控写入接口
4. **日志记录**：所有 MCP 调用记录到应用日志，便于审计

### 6.9 验收标准

#### MCP Server 基础能力

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M1 | MCP Server 正确暴露 tools | Claude Desktop 可发现并连接 |
| AC-M2 | `get_categories` 返回当前所有启用分类 | 包含 id、name、type、description |
| AC-M3 | `get_operators` 返回现有操作人列表 | 包含 id、name |
| AC-M4 | `send_transactions` 接收交易数组并打开确认界面 | 调用后 Moneta 立即弹出确认窗口 |
| AC-M5 | `send_transactions` 数据校验 | 必填字段缺失时返回错误提示 AI |

#### AI 交互体验

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M6 | AI 能正确转换常见账单格式 | 支付宝、微信、银行 CSV/Excel |
| AC-M7 | AI 正确处理日期格式 | 转换为 YYYY-MM-DD |
| AC-M8 | AI 正确处理金额 | 统一转为正数，根据类型判断收/支 |
| AC-M9 | AI 自动建议合理的分类映射 | 结合 name 和 description 进行语义匹配 |
| AC-M10 | 分类不确定时 AI 留空或建议 | 不强行匹配错误分类 |

#### 确认界面

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M11 | MCP 导入触发后打开确认界面 | 复用 AI 识别确认页组件 |
| AC-M12 | 界面显示数据来源为「MCP 导入」 | 与 AI 图片识别区分 |
| AC-M13 | 支持所有行内编辑操作 | 修改字段、删除行、插入行 |
| AC-M14 | 未匹配分类的行高亮显示 | 红色背景或边框提示 |
| AC-M15 | 分类为空时阻止提交 | 提示用户补充 |
| AC-M16 | 导入成功后显示结果提示 | 成功导入 N 条记录 |

#### 数据准确性

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M17 | 日期格式正确转换 | YYYY-MM-DD 存入数据库 |
| AC-M18 | 金额正确处理正负数 | 消费为负、收入为正或按配置处理 |
| AC-M19 | 分类正确映射 | AI 建议的分类可手动调整 |
| AC-M20 | 操作人正确设置 | 初始为空，用户必须手动选择后才能提交 |

#### 异常处理

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M21 | 文件不存在时返回友好错误 | AI 可读取并告知用户 |
| AC-M22 | 文件格式不支持时提示 | 非 Excel/CSV 文件 |
| AC-M23 | 空文件或无可识别数据时提示 | 避免打开确认界面 |
| AC-M24 | 导入执行失败时返回错误详情 | 如数据库写入错误 |

#### MCP 配置与注册

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-M25 | 设置页提供「配置 Claude Desktop MCP」按钮 | 位于「AI 模型」Tab |
| AC-M26 | 一键配置自动写入 claude_desktop_config.json | 正确检测平台配置文件路径 |
| AC-M27 | 已存在其他 MCP 配置时正确合并 | 不覆盖其他服务器配置 |
| AC-M28 | 配置成功后提示重启 Claude Desktop | 引导用户完成最后一步 |
| AC-M29 | 提供手动配置指引 | 自动配置失败时可手动操作 |
| AC-M30 | MCP Server 可独立启动 | `moneta-mcp --mcp` 能正常启动 |

### 6.6 MCP Skill 文档（供 AI 助手使用）

为了让 AI 助手（如 Claude）能够正确、高效地使用 MCP 工具帮助用户导入账单，需要提供一份 Skill 文档。该文档通常放在项目的 `.claude/skills/` 或 `docs/skills/` 目录下，AI 助手可通过读取该文档学习最佳实践。

#### Skill 文档建议位置

```
.claude/skills/mcp-moneta-import.md
```

或

```
docs/skills/mcp-moneta-import.md
```

#### Skill 文档核心内容

**1. 工具使用指南**

```markdown
# Moneta 账单导入助手

## 何时使用
当用户想要从 Excel/CSV 文件导入账单数据到 Moneta 记账软件时使用本技能。

## 工具使用流程

### 步骤 1：获取元数据
调用 `get_categories()` 获取所有分类（含 AI 描述）。
调用 `get_operators()` 获取操作人列表。

### 步骤 2：分析用户数据
用户会提供文件路径或直接粘贴内容。你需要：
1. 识别日期列并统一转换为 YYYY-MM-DD 格式
2. 识别金额列，统一转为正数，根据类型判断收/支
3. 识别描述/商品名称列，用于匹配分类
4. 如有交易类型列（收入/支出），映射为 expense/income

### 步骤 3：智能分类匹配
对于每条记录，结合分类的 name 和 description 进行匹配：
- "美团外卖" → 匹配「正餐」（description 包含"外卖"）
- "滴滴出行" → 匹配「交通」（description 包含"打车"）
- 无法确定时留空 category_id，只保留原始描述

### 步骤 4：发送数据
调用 `send_transactions({
  transactions: [...],
  source: "描述数据来源"
})`
Moneta 会自动打开确认界面，用户完成最终编辑后入库。

## 注意事项
- 金额必须是正数，类型字段判断收/支
- 日期格式严格为 YYYY-MM-DD
- 不确定的分类不要强行匹配，留给用户确认界面处理
- 复杂文件（如多 sheet、非常规格式）先询问用户确认字段映射
```

**2. 分类匹配示例表**

Skill 文档应包含常见账单关键词与分类的映射示例，帮助 AI 学习：

| 账单关键词 | 匹配分类 | 依据（description） |
|-----------|---------|-------------------|
| 美团、饿了么、餐厅 | 正餐 | "外卖、堂食、食堂、餐厅" |
| 滴滴、uber、地铁、加油 | 交通 | "地铁、公交、打车、加油" |
| 淘宝、京东、超市 | 百货 | "超市购物、日用品" |
| Steam、电影票、KTV | 娱乐 | "游戏、电影、演出、KTV" |
| 工资、薪资 | 工资 | "固定薪资收入" |
| 基金定投、股票买入 | 基金/股票 | 投资分类 |

#### 验收标准

| # | 验收条件 | 说明 |
|---|---------|------|
| AC-SK1 | 提供完整的 Skill 文档 | 包含工具使用流程和分类匹配示例 |
| AC-SK2 | 文档位置符合约定 | `.claude/skills/` 或 `docs/skills/` |
| AC-SK3 | 工具 description 字段清晰 | MCP Server 返回的工具描述准确 |
| AC-SK4 | 分类匹配示例覆盖常见场景 | 至少包含消费、收入、投资各 3 个示例 |

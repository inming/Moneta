# AI 模型与识别架构

> 从 CLAUDE.md 拆分。修改 AI 模型配置、识别流程、响应解析、确认界面时请先阅读本文档。

## 模型配置

- 内置模型定义在 `src/main/services/config.service.ts` 的 `BUILTIN_MODELS` 数组中
- 新增模型只需往 `BUILTIN_MODELS` 加一项，`loadConfig()` 会自动同步到用户配置文件
- `loadConfig()` 同步策略：仅从内置定义覆盖 `name` 和 `format`，**不覆盖** `endpoint` 和 `model`（这两者是用户可编辑的）
- 用户配置存储路径：`app.getPath('userData')` 下的 `config.json`（Windows: `%APPDATA%/moneta/`）
- API Key 使用 Electron `safeStorage` 加密后以 base64 存储

## AI 适配器

- 适配器模式：`src/main/services/ai-adapters/`，通过 `AIAdapter` 接口抽象
- 当前仅保留 `OpenAIAdapter`（OpenAI 兼容格式），所有内置模型统一使用此适配器
- `fetchWithTimeout` 默认超时 300 秒（多图识别场景需要较长时间）
- 新增 API 格式时：在 `ai-adapters/` 下创建新适配器，在 `getAdapter()` 中按 `format` 分发

## AI 响应解析

- AI 响应解析采用**多层容错策略**（`parseAIResponse()`）：
  1. 先用正则 `/<\/?[a-zA-Z_][a-zA-Z0-9_-]*>/g` 剥离 XML 标签（如某些模型返回 `<tool_call>...</tool_call>` 包裹）
  2. 尝试从 Markdown 代码块中提取 JSON
  3. 查找第一个 `[` 和最后一个 `]` 提取 JSON 数组
  4. 如果数组解析失败，回退到解析完整 JSON 对象并通过 `extractArray()` 递归查找嵌套数组
- 该策略兼容各种模型输出格式（Markdown 代码块、XML 标签包裹、嵌套 JSON 对象、前后缀文字等）
- Prompt 中将用户现有分类列表以 **JSON 数组**格式传入（每项含 `name` 和可选 `description`），引导 AI 通过 `suggestedCategory` 字段建议分类
- 分类无描述时 JSON 中省略 `description` key，避免冗余；有描述时格式如 `{"name":"正餐","description":"外卖、堂食、食堂"}`

## AI 识别取消机制

- 使用模块级 `AbortController`（`ai-recognition.service.ts`），每次 `recognize()` 创建新实例
- 渲染进程通过独立 IPC 通道 `ai:recognize:abort` 调用 `abortRecognition()` 触发取消
- `fetchWithTimeout()` 接受 `externalSignal` 参数，将外部 abort 信号转发到内部 controller
- 取消 vs 超时区分：检查 `externalSignal.aborted` 判断是用户取消还是超时，返回不同错误消息
- 前端 AI 识别页显示耗时计时器（1 秒间隔）和取消按钮，取消后的错误消息被静默处理不弹 toast

## 配置文件升级策略

- `loadConfig()` 负责配置文件的前向兼容：
  - 自动添加新版本引入的内置模型
  - 自动清理旧版本已移除的模型
  - 验证 `defaultProviderId` 的有效性，失效时自动重置
  - 新增配置字段时，在 `loadConfig()` 中检查 `=== undefined` 并补默认值，确保旧配置文件自动升级
- 用户升级应用后无需手动操作配置文件

---

## AI 识别确认界面架构

### 数据流与状态管理

AI 识别确认界面（`AIRecognition/index.tsx`）采用纯前端状态管理，无需与主进程通信即可完成的增删改操作：

| 操作 | 状态更新方式 | 说明 |
|------|-------------|------|
| 插入行 | `setResults((prev) => splice(index, 0, newRow))` | 在当前行上方插入，继承类型和操作人 |
| 追加行 | `setResults((prev) => [...prev, newRow])` | 在表格末尾添加 |
| 删除行 | `filter((row) => row.key !== key)` | 按 key 过滤移除 |
| 更新字段 | `map((row) => row.key === key ? {...row, field} : row)` | 全字段可编辑 |

### 行标识策略

- **AI 识别结果**：使用服务端返回的 key（如 `item-${index}` 或 UUID）
- **手动插入行**：使用 `manual-${timestamp}-${random}` 前缀，便于区分来源和调试

### 默认值继承模式

新插入行采用「智能继承」策略减少用户输入：

```typescript
const newRow = {
  key: `manual-${Date.now()}-${random}`,
  type: currentRow.type,           // 继承：用户通常连续录入同类型交易
  operator_id: currentRow.operator_id,  // 继承：同一批录入通常同一操作人
  amount: 0,                       // 清空：金额必须重新输入
  description: '',                 // 清空：描述各不相同
  category_id: null                // 清空：触发必填校验和高亮
}
```

### 编辑状态设计

- **全量编辑模式**：所有行始终处于可编辑状态，无需「进入编辑」开关
- **实时校验**：分类为空时 `status="error"`，行背景色变为红色（`row-missing-category`）
- **批量提交校验**：点击「确认录入」时检查所有行的 `category_id`、全局日期和操作人是否已设置，任一缺失则阻止提交并提示

### 日期与操作人必填机制

- **初始留空**：日期选择器和操作人选择器默认为空（`null`），不预填任何默认值，要求用户主动确认
- **视觉提示**：未选择时显示 `status="error"` 红色边框 + placeholder 文本
- **提交校验**：`handleConfirm` 中依次检查分类 → 日期 → 操作人，未填则 `message.error` 提示
- **操作人联动**：全局操作人选择器变化时，`onChange` 中同步更新所有行的 `operator_id`
- **MCP 日期清空**：MCP 数据中携带的日期在确认页统一清空，使用全局日期选择器

---

**相关文档**：
- 产品规格：`docs/prd-archive/ai-recognition.md`、`docs/prd-archive/ai-model-config.md`
- 总体架构：`docs/ARCHITECTURE.md`

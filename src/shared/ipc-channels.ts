export const IPC_CHANNELS = {
  // 交易
  TRANSACTION_LIST: 'db:transaction:list',
  TRANSACTION_CREATE: 'db:transaction:create',
  TRANSACTION_UPDATE: 'db:transaction:update',
  TRANSACTION_DELETE: 'db:transaction:delete',
  TRANSACTION_BATCH_CREATE: 'db:transaction:batch-create',
  TRANSACTION_BATCH_DELETE: 'db:transaction:batch-delete',

  // 分类
  CATEGORY_LIST: 'db:category:list',
  CATEGORY_LIST_ALL: 'db:category:list-all',
  CATEGORY_CREATE: 'db:category:create',
  CATEGORY_UPDATE: 'db:category:update',
  CATEGORY_DELETE: 'db:category:delete',
  CATEGORY_REORDER: 'db:category:reorder',

  // 操作人
  OPERATOR_LIST: 'db:operator:list',
  OPERATOR_CREATE: 'db:operator:create',
  OPERATOR_UPDATE: 'db:operator:update',
  OPERATOR_DELETE: 'db:operator:delete',

  // 统计
  STATS_CROSS_TABLE: 'db:stats:cross-table',
  STATS_SUMMARY: 'db:stats:summary',
  STATS_YEAR_RANGE: 'db:stats:year-range',
  STATS_YEARLY_CATEGORY: 'db:stats:yearly-category',
  STATS_FORECAST: 'db:stats:forecast',

  // 导入导出
  IMPORT_PREVIEW: 'io:import:preview',
  IMPORT_EXECUTE: 'io:import:execute',
  EXPORT_EXECUTE: 'io:export:execute',
  EXPORT_COUNT: 'io:export:count',

  // 数据管理
  DATA_CLEAR_TRANSACTIONS: 'db:data:clear-transactions',
  DATA_FACTORY_RESET: 'db:data:factory-reset',

  // AI 模型配置
  AI_PROVIDER_LIST: 'ai:provider:list',
  AI_PROVIDER_UPDATE: 'ai:provider:update',
  AI_PROVIDER_SET_DEFAULT: 'ai:provider:set-default',
  AI_PROVIDER_TEST: 'ai:provider:test',

  // AI 识别
  AI_RECOGNIZE: 'ai:recognize',
  AI_RECOGNIZE_ABORT: 'ai:recognize:abort',
  AI_RECOGNIZE_LOGS: 'ai:recognize:logs',
  AI_PROMPT_PREVIEW: 'ai:prompt:preview',

  // 认证
  AUTH_HAS_PIN: 'auth:pin:has',
  AUTH_SET_PIN: 'auth:pin:set',
  AUTH_VERIFY_PIN: 'auth:pin:verify',
  AUTH_CHANGE_PIN: 'auth:pin:change',
  AUTH_GET_AUTO_LOCK: 'auth:auto-lock:get',
  AUTH_SET_AUTO_LOCK: 'auth:auto-lock:set',

  // 文件对话框
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file',

  // MCP 配置
  MCP_START_SERVER: 'mcp:start-server',
  MCP_CONFIGURE_CLAUDE: 'mcp:configure-claude',
  MCP_GET_STATUS: 'mcp:get-status',
  MCP_GET_HTTP_CONFIG: 'mcp:get-http-config',
  MCP_UPDATE_PORT: 'mcp:update-port',
  MCP_GET_PATHS: 'mcp:get-paths',
  MCP_HTTP_STATUS_CHANGED: 'mcp:http-status-changed',

  // MCP 导入
  MCP_IMPORT_OPEN: 'mcp:import:open',
  MCP_IMPORT_GET_DATA: 'mcp:import:get-data',
  MCP_IMPORT_CLEAR_DATA: 'mcp:import:clear-data',
  MCP_IMPORT_CONFIRM: 'mcp:import:confirm',

  // 导入草稿
  DRAFT_GET: 'db:draft:get',
  DRAFT_SAVE: 'db:draft:save',
  DRAFT_DELETE: 'db:draft:delete',
  DRAFT_GET_SUMMARY: 'db:draft:get-summary',

  // 国际化
  I18N_GET_LANGUAGE: 'i18n:get-language',
  I18N_SET_LANGUAGE: 'i18n:set-language',

  // 主题
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set'
} as const

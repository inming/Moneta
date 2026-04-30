# S3 数据同步架构

> 新增功能。修改同步、凭证存储、备份相关代码时请先阅读本文档。
>
> 设计参考：`/Users/inming/workspace/Shibei` 的 `crates/shibei-sync`，按 Moneta 单库整体同步的需求做了简化。

## 设计目标

- **多设备共享**：同一用户在 macOS / Windows 桌面之间共享账本数据
- **数据兜底**：远端保留滚动备份，本地损坏时可从云端恢复
- **简单可靠**：不做增量合并，整库文件级同步；冲突由用户决断
- **复用现有加密**：上行的 SQLite 文件已是 SQLCipher 密文，S3 端无需再加一层

## 与 Shibei 的差异

| 维度 | Shibei | Moneta |
|------|--------|--------|
| 同步粒度 | 增量（JSONL changelog + HLC + LWW 自动合并） | **整库文件级** |
| 端到端加密 | XChaCha20-Poly1305 包一层 | **复用 SQLCipher**，S3 上直接是密文 db |
| 多端冲突 | 自动 LWW 合并 | **manifest CAS 抢占 + 用户选择** |
| 移动端配对 | QR 配对 | 不需要（仅桌面） |
| 凭证存储 | OS keystore（keyring crate） | **Electron `safeStorage`** |
| 技术栈 | Rust + Tauri + rust-s3 | Node + Electron + `@aws-sdk/client-s3` |

整库同步的核心代价：**两台设备同时改不能合并**。通过 manifest 版本号 + S3 条件写实现 CAS（compare-and-swap），冲突时让用户做选择。

## 关键决策

### 1. 整库同步而非增量

记账数据写入频率低（人工录入为主），整库同步带宽和计算开销可接受。增量同步需要引入 changelog 表、HLC、拓扑排序等大量复杂度，对单用户/家庭场景收益不成比例。

### 2. 复用 SQLCipher 加密 + 密钥信封跨设备共享

数据库文件本身已被 SQLCipher 加密（见 [database-encryption.md](database-encryption.md)），上传 S3 时是密文，无需再叠加一层 ChaCha20。S3 端可选启用 SSE-S3 提供存储侧加密（取决于服务商）。

**但有一个关键问题**：每台设备首次启动时通过 `crypto.randomBytes(32)` 随机生成 SQLCipher 密钥，存在本机 `safeStorage` 中。设备 A 加密的 db，设备 B 用本机随机密钥**无法解密**。

**解决方案：密钥信封（keyenv.json）**

- 用户在首次设置时输入"同步口令"（passphrase）
- 通过 PBKDF2-SHA256（600k 迭代）派生 32 字节加密密钥
- 用 AES-256-GCM 包裹本机 SQLCipher hex key，得到 `keyenv.json` 上传到 S3
- 第二台设备输入相同 passphrase → 下载 keyenv.json → 解包 → 替换本机 SQLCipher 密钥 → 下载并打开远端 db
- passphrase **不在本机或云端存储**，仅在 setup/join 时短暂使用

### 3. CAS 抢占式写入

manifest.json 的 ETag 用作乐观锁。上传流程：
1. 读 manifest 拿到 ETag
2. 上传新 db 文件
3. PUT manifest with `If-Match: <ETag>` — 失败说明别人先写了，回到状态机重判

无需 S3 上的分布式锁服务，所有 S3 兼容服务都支持条件写。

### 4. 凭证不进 config.json 明文

AccessKey / SecretKey 通过 `safeStorage.encryptString()` 加密后存盘，仅在主进程内存中解密使用。`safeStorage` 在 macOS = Keychain，Windows = DPAPI。Linux 无 keyring 时硬拒绝同步，不静默降级。

### 5. WAL 必须先 checkpoint

better-sqlite3 默认 WAL 模式。同步前必须 `PRAGMA wal_checkpoint(TRUNCATE)`，否则上传的 db 主文件不含最近写入，下载方恢复后数据缺失。

## S3 对象布局

```
{bucket}/{prefix}/
  manifest.json                          # 版本指针，CAS 入口
  keyenv.json                            # 密钥信封（passphrase 包裹的 SQLCipher 密钥）
  db.sqlite.gz                           # 当前主库（gzip 压缩的 SQLCipher 密文）
  backups/
    db-2026-04-30T10-15-22Z.sqlite.gz    # 滚动备份，保留最近 N 份
    db-2026-04-29T22-03-11Z.sqlite.gz
```

**keyenv.json 结构**：

```json
{
  "format": 1,
  "kdf": {
    "algo": "pbkdf2-sha256",
    "iterations": 600000,
    "salt": "<base64 16 bytes>"
  },
  "cipher": {
    "algo": "aes-256-gcm",
    "iv": "<base64 12 bytes>",
    "ciphertext": "<base64 包裹后的 SQLCipher hex key>",
    "tag": "<base64 GCM tag>"
  },
  "keyFingerprint": "<sha256 of hex key, 前 32 字符>",
  "createdAt": "..."
}
```

`keyFingerprint` 同时出现在 `manifest.json` 和 `keyenv.json` 中。运行时三处相等：本机 SQLCipher 密钥指纹 == manifest.keyFingerprint == keyenv.keyFingerprint，否则进入 setup 流程。

**manifest.json**（明文 JSON，不含敏感数据）：

```json
{
  "version": 42,
  "writerDeviceId": "mac-abc123",
  "writtenAt": "2026-04-30T10:15:22.481Z",
  "schemaVersion": 7,
  "size": 1234567,
  "sha256": "abcd...",
  "keyFingerprint": "sha256:0x...",
  "appVersion": "0.8.1"
}
```

字段说明：

| 字段 | 用途 |
|------|------|
| `version` | 单调递增整数；CAS 锚点 |
| `writerDeviceId` | 谁写的；冲突 UI 提示用 |
| `writtenAt` | 写入时刻；冲突 UI 提示用，**不参与判定** |
| `schemaVersion` | 数据库迁移序号；防止低版本 app 拉到高版本 db |
| `sha256` | db.sqlite.gz 的内容哈希；下载后校验 |
| `keyFingerprint` | SQLCipher 密钥指纹（hash）；防止 PIN 不匹配误覆盖 |
| `appVersion` | 调试用 |

## 本地状态

持久化在 `config.json` 中：

```ts
interface SyncState {
  enabled: boolean
  s3: {
    endpoint: string         // 支持 AWS / Cloudflare R2 / MinIO / 阿里 OSS-S3 兼容
    region: string
    bucket: string
    prefix: string           // 如 "moneta/" 允许同 bucket 多用户
    pathStyle: boolean       // 自托管 MinIO 需要 true
  }
  // 凭证不在这里 — 走 safeStorage 加密后存独立字段
  autoSync: {
    onStart: boolean
    onExit: boolean
    intervalMinutes: number  // 0 = 关
  }
  cursor: {
    lastSyncedVersion: number       // 上次成功同步时的 manifest.version
    lastSyncedAt: string
    lastSyncedSha256: string        // 用于检测本地是否脏
  }
  deviceId: string                  // 首次启动生成的 UUID
}
```

**判定本地是否 dirty**：当前 db 文件 sha256 ≠ `cursor.lastSyncedSha256`。

## 同步状态机

```
sync():
  1. 并行读远端 manifest 和 keyenv.json
       ↓
  2. 设置分支：
     - 远端 manifest 和 keyenv 都没有 → needs-setup-initial
     - 远端有 manifest 但没有 keyenv → 异常（cloud 损坏，提示重置）
     - 远端有 keyenv 但本地密钥指纹 ≠ keyenv.keyFingerprint → needs-setup-join
     - 远端只有 keyenv 没有 manifest（设置后未上传）→ uploadFlow(initial)
       ↓（指纹一致后才进入下面）
  3. 同步分支：
     A. remote.version == cursor.lastSyncedVersion
        → 本地脏？ uploadFlow() : 无操作
     B. remote.version >  cursor.lastSyncedVersion
        → 本地脏？ CONFLICT(prompt user) : downloadFlow()
     C. remote.version <  cursor.lastSyncedVersion
        → 异常（用户可能手动改了 bucket），强提示
```

### setupInitial(passphrase)

1. 检查云端 keyenv.json 不存在（防止覆盖）
2. 读取本机 SQLCipher hex key
3. PBKDF2(passphrase, salt) → 32 字节派生 key
4. AES-256-GCM 包裹 hex key → keyenv.json
5. 上传 keyenv.json
6. 走 uploadFlow(initial) 上传 db + manifest

### setupJoin(passphrase)

1. 下载云端 keyenv.json
2. PBKDF2 + AES-256-GCM 解包 → 得到云端 SQLCipher hex key
3. 校验解包后 fingerprint == keyenv.keyFingerprint，否则 `WrongPassphraseError`
4. 下载远端 db.sqlite.gz，校验 size + sha256
5. 备份本地 db 文件 → 备份本地 dbKey（内存）
6. closeDatabase() → replaceDbKey(newKey) → installDatabase(downloaded)
7. getDatabase() 用新 key 重新打开
8. 任一步失败 → 回滚 dbKey 和 db 文件
9. 写入 cursor，状态 success

### uploadFlow

```
1. PRAGMA wal_checkpoint(TRUNCATE)        # 把 WAL 压回主文件
2. 复制 db 文件到 临时路径
3. gzip → 计算 sha256
4. PUT db.sqlite.gz                        # 普通 put（大文件用 lib-storage 自动多段）
5. 当前 db 另存为 backups/db-{ts}.sqlite.gz
6. 构造新 manifest（version + 1）
7. PUT manifest.json with If-Match: <oldEtag>
   ├─ 成功 → 更新本地 cursor
   └─ 412 Precondition Failed → 别人先写了，回到状态机重判（最多 3 次）
8. 异步清理 backups 中超出保留数量的旧文件
```

### downloadFlow

```
1. GET db.sqlite.gz → 临时文件
2. 验 sha256 == manifest.sha256，否则报错
3. 验 keyFingerprint 与本地 PIN 派生密钥指纹一致，否则提示并退出
4. 关闭 better-sqlite3 句柄
5. 当前 db 改名为 db.sqlite.bak（本地兜底）
6. 解压临时文件 → 替换 db.sqlite
7. 用本地密钥尝试打开 → 失败则回滚 .bak
8. 更新 cursor，删除 .bak
```

### 冲突 UI

```
检测到冲突：
  本地有未同步的修改（最近改动 2026-04-30 09:50）
  远端有更新版本（来自设备 "windows-pc"，2026-04-30 10:12）

  选择：
    [使用远端覆盖本地]   推荐，本地改动会保留为本地备份文件
    [用本地覆盖远端]     远端版本会归档到 backups/
    [稍后处理]            取消本次同步
```

## 触发时机

| 时机 | 行为 | 默认 |
|------|------|------|
| 用户点"立即同步" | 完整 sync() | — |
| 应用启动 | sync()，远端新则拉取 | 开 |
| 应用退出 | 本地脏则推送，等待完成（30s 兜底） | 开 |
| 周期性 | 每 N 分钟 sync() | 关（用户配） |
| 数据变更 | 防抖 60s 后标记"待同步"（不立刻发） | 关 |

不在每次 CRUD 后立即同步，避免频繁产生备份和冲突。

## 模块划分

```
src/main/services/sync/
  s3Client.ts          # @aws-sdk/client-s3 封装：put/get/head/delete + CAS（IfMatch/IfNoneMatch）
  manifest.ts          # 读写 manifest，CAS 写入
  keyEnvelope.ts       # PBKDF2 + AES-256-GCM 包裹/解包 SQLCipher 密钥
  dbPackage.ts         # checkpoint → 复制 → gzip → sha256；逆向解包
  syncStore.ts         # cursor / 配置 / 凭证（safeStorage）持久化
  syncEngine.ts        # 状态机、setup 流程、冲突判定、备份清理

src/main/ipc/
  sync.ipc.ts          # IPC handler

src/shared/types/
  sync.ts              # SyncState / SyncStatus / ConflictInfo

src/renderer/src/pages/Settings/
  SyncSettings.tsx     # 配置 + 测试连接 + 立即同步 + 状态展示

src/renderer/src/hooks/
  useSync.ts           # 监听 main 进程 sync 事件
```

### IPC 通道

按 [CLAUDE.md](../../CLAUDE.md) 命名规范，新增 `sync` 命名空间：

| 通道 | 用途 |
|------|------|
| `sync:config:get` / `sync:config:set` | S3 配置（endpoint / bucket / 自动同步策略） |
| `sync:credentials:set` / `sync:credentials:clear` | 写入/清除 AccessKey/SecretKey |
| `sync:test` | 测试连通性 + 凭证 + bucket 可写 |
| `sync:now` | 手动触发同步 |
| `sync:status` | 查询当前状态：idle / uploading / downloading / conflict / error |
| `sync:resolve-conflict` | 传递用户选择（local-wins / remote-wins / cancel） |
| `sync:inspect` | 探查云端状态：是否有 manifest/keyenv、指纹是否匹配 |
| `sync:setup:initial` | 首次设置：用 passphrase 包裹本机 key 并上传 |
| `sync:setup:join` | 加入云端：用 passphrase 解包远端 key 并替换本机 |
| `sync:reset-cloud` | 清空云端所有对象（manifest / keyenv / db / backups） |
| `sync:event`（main → renderer 推送） | 进度、状态变化通知 |

新增需同步改三处：`src/shared/ipc-channels.ts` / `src/main/ipc/sync.ipc.ts` / `src/preload/index.ts` + `index.d.ts`。

## 边界情况

1. **跨设备密钥不一致** — 由 keyenv.json 解决，见前文"密钥信封"。运行时通过指纹比对触发 setup-join 流程。
2. **passphrase 丢失** — 不可恢复。云端数据无法解密。提示用户在 UI 中清晰说明"丢失口令意味着无法在新设备恢复"。
2. **Schema 版本错配** — manifest 带 `schemaVersion`。拉取时 remote.schema > local.schema → 提示升级 app；local.schema > remote.schema → 推送时强制升 manifest.schemaVersion，对方拉到后被同样规则挡住。
3. **WAL 文件** — 必须先 checkpoint，不要直接打包 `.db-wal` / `.db-shm`，否则别处恢复后数据不一致。
4. **大文件传输中断** — `@aws-sdk/lib-storage` 的 `Upload` 类自带分片+断点，> 5MB 自动多段。
5. **S3 兼容服务的 ETag** — MinIO/R2 的多段上传 ETag 不是 md5；manifest 是单段 PUT，CAS 用 ETag 没问题；db 文件不要拿 ETag 当校验，用我们自己算的 sha256。
6. **时钟偏移** — 不依赖时间戳判先后，仅用 manifest.version 单调递增。
7. **多次冲突堆叠** — CAS 失败后重判最多 3 次，超过则退到用户冲突弹窗，避免活锁。
8. **bucket 被换** — `cursor.lastSyncedVersion > remote.version` 视为异常，提示用户检查 bucket 配置而非自动覆盖。
9. **凭证回收** — `sync:credentials:clear` 必须同时清除 safeStorage 内容和内存缓存。

## 阶段计划

按价值/依赖关系分三阶段上线，每个阶段独立可用。

### P1 — 最小闭环（MVP）

> 目标：能配置、能手动同步、有冲突保护、远端有备份、跨设备可用。

- [x] 主进程 `s3Client` + `dbPackage` + `manifest` + `keyEnvelope` 四个底层模块
- [x] `safeStorage` 凭证存储（含不可用时的硬拒绝逻辑）
- [x] 配置 UI：S3 endpoint / region / bucket / prefix / pathStyle / AccessKey / SecretKey
- [x] "测试连接"按钮（验证凭证 + bucket 读写权限）
- [x] "立即同步"按钮 + 完整状态机
- [x] **首次设置 / 加入云端**：passphrase 包裹本机 SQLCipher 密钥，跨设备密钥共享
- [x] 冲突弹窗（三选项）
- [x] **重置云端**按钮（清空所有对象）
- [x] 滚动备份（每次上传归档一份，固定保留 7 份）
- [x] schemaVersion 不匹配的硬阻断
- [x] keyFingerprint 三方一致性校验

**完成标志**：两台设备能手动来回同步（通过共享 passphrase），断网可重试，passphrase 错误不会数据丢失。

### P2 — 自动化与体感

> 目标：日常使用零打扰，状态可视化。

- [ ] 启动时自动 sync（远端新则拉取，本地脏则推送，冲突仍走弹窗）
- [ ] 退出时自动 push（最多等 30s，超时跳过并保留脏标记）
- [ ] 周期性同步（用户配 0/5/15/30 分钟）
- [ ] 顶栏状态徽标（已同步 / 待同步 / 正在同步 / 出错 / 冲突待处理）
- [ ] 同步进度（上传/下载字节数）
- [ ] i18n 翻译文案（中/英）

**完成标志**：用户在两台机器之间日常切换不需要主动点同步按钮。

### P3 — 高级与运维

> 目标：长期使用的运维能力。

- [ ] 备份浏览 UI：列出 backups/ 内容，可下载或还原指定快照
- [ ] 备份保留策略可配（份数 / 总容量上限 / 时间窗口）
- [ ] "重置同步状态"按钮（清空 cursor，下次按全新设备处理）
- [ ] 数据变更防抖触发（可选开启）
- [ ] 同步日志面板（最近 N 次结果，便于排错）
- [ ] 可选：备份独立加密（针对完全不信任的 bucket 场景，叠加 ChaCha20）

**完成标志**：用户可自助处理云端历史和异常恢复，不需要手动操作 S3 控制台。

## 安全边界

- **传输层**：必须 HTTPS。配置时禁止 `http://` endpoint（除非 endpoint host 是 `localhost`，便于本地 MinIO 调试）。
- **静态加密**：数据库本身已加密；S3 服务商的 SSE 是额外加成而非依赖。
- **凭证**：safeStorage 加密；进程间不传输；测试连接错误信息脱敏（不回显 secret）。
- **manifest 不含敏感数据**：仅版本/时间/哈希/设备 ID/schema 版本，泄露 manifest 不会泄露记账数据。
- **bucket 隔离**：建议用户为 Moneta 单独建 bucket 或独立 prefix，避免与其他应用冲突。

## 已决策

1. **safeStorage 不可用时的策略**：**硬拒绝**。Linux 无 keyring 时禁用同步功能并提示用户启用 keyring，绝不明文落盘凭证。
2. **冲突默认动作**：**始终弹窗让用户选**。三选项（用远端覆盖本地 / 用本地覆盖远端 / 取消），不内置"本地为准"的偷跑策略。
3. **备份保留默认值**：**保留最近 7 份，不设容量上限**。后续在 P3 暴露给用户配置。
4. **S3 兼容一等公民**：**AWS S3 + 阿里云 OSS（S3 兼容模式）**。其他 S3 兼容服务（R2 / MinIO）原则上可用但不做测试覆盖。
   - AWS：默认 virtual-hosted style
   - 阿里 OSS：endpoint 例 `https://oss-cn-hangzhou.aliyuncs.com`，bucket 在 host 前缀，需要按其 S3 兼容文档确认 region / pathStyle 默认值
5. **MVP 范围**：**P1 仅手动同步**。启动/退出/周期同步留到 P2，避免早期自动行为掩盖问题。

## 阶段实施 checklist 调整

基于上述决策，P1 的范围明确为：

- 配置 UI（含 AWS / 阿里 OSS 两种 endpoint 预设）
- 凭证写入 / 测试连接（safeStorage 不可用直接禁用功能）
- 手动"立即同步"按钮 + 完整状态机
- 冲突弹窗（始终弹）
- 滚动备份固定 7 份
- schemaVersion / keyFingerprint 校验
- 无任何自动触发逻辑

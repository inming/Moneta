# Database Encryption Design

## Overview

Encrypt the Moneta SQLite database using SQLCipher (via `better-sqlite3-multiple-ciphers`) with OS-managed keys (Electron `safeStorage`). The encryption is transparent to all existing code — repositories, IPC handlers, MCP HTTP server, and the frontend require zero changes.

## Dependency Change

- Remove `better-sqlite3@^11.10.0`
- Add `better-sqlite3-multiple-ciphers@^12.8.0`
- API is identical; only the import statement in `connection.ts` changes
- The package ships prebuilt binaries for Electron v29-v41, supporting Windows, macOS, and Linux

## Key Management

1. **Generation**: `crypto.randomBytes(32)` → 256-bit random key, converted to hex string
2. **Storage**: Encrypted via existing `encryptString()` (Electron `safeStorage`) → stored as `dbKeyEncrypted` in `config.json`
3. **Retrieval**: `decryptString(config.dbKeyEncrypted)` on startup → hex key used as `PRAGMA key`
4. **No user interaction**: Key generation and usage is fully automatic

## Database Connection (`connection.ts`)

```
1. Decrypt key from config.dbKeyEncrypted (or generate + save if missing)
2. Detect if migration needed (see Migration State Machine below)
3. If migration needed: migrate plaintext → encrypted (see below)
4. Open database: new Database(dbPath)
5. Set encryption PRAGMAs (key MUST be first PRAGMA after open):
   - PRAGMA key = "x'<hex_key>'"
   - PRAGMA cipher = 'sqlcipher'
   - PRAGMA cipher_page_size = 4096
   - PRAGMA kdf_iter = 256000
6. Set existing PRAGMAs:
   - PRAGMA journal_mode = WAL
   - PRAGMA foreign_keys = ON
```

### Cipher Selection: `sqlcipher` (AES-256-CBC)

Uses the default `sqlcipher` cipher rather than `sqleet`. Reasons:
- SQLite3MultipleCiphers community documentation and examples center on `sqlcipher`
- `sqlcipher_export()` is confirmed to work in `sqlcipher` cipher mode
- Better test coverage and compatibility guarantees
- Performance difference is negligible for Moneta's workload (personal finance, <100k rows)

## Migration: Plaintext → Encrypted

### Trigger Conditions

Migration is needed when `config.json` has `dbKeyEncrypted` AND `dbMigrationState !== 'done'`:

| `dbKeyEncrypted` | `dbMigrationState` | Action |
|---|---|---|
| missing | missing | New install or old version → generate key, create encrypted DB directly (no migration) |
| present | `'pending'` | Previous migration was interrupted → re-attempt migration from `.bak` |
| present | `'done'` | Normal startup → open encrypted DB normally |
| present | missing | Old migration attempt (v0.7.0-alpha without state tracking) → treat as `'pending'` |

### Migration Steps

1. **Backup**: Rename `moneta.db` → `moneta.db.plain.bak`
2. **Set state**: Save `dbMigrationState = 'pending'` to `config.json`
3. **Open plaintext**: Open `moneta.db.plain.bak` without PRAGMA key (plaintext mode)
4. **Attach encrypted**: `ATTACH DATABASE 'moneta.db' AS encrypted KEY "x'<hex_key>'"`
5. **Export**: `SELECT sqlcipher_export('encrypted')`
6. **Verify in-connection**: Check table count and row counts match between source and target
7. **Close connection**: Close both databases (releases file locks on WAL/SHM)
8. **Cleanup WAL/SHM**: Delete `moneta.db.plain.bak-wal` and `moneta.db.plain.bak-shm`
9. **Verify by reopening**: Open `moneta.db` with the encryption key, run a test query (e.g., `SELECT count(*) FROM _migrations`)
10. **Mark complete**: Save `dbMigrationState = 'done'` to `config.json`
11. **Delete backup**: Delete `moneta.db.plain.bak`

### Failure Recovery

**Scenario A**: Crash between steps 2-6 (config has key + state `'pending'`, `.bak` exists, `moneta.db` missing or incomplete)
- On next startup, detect `dbMigrationState = 'pending'` + `.bak` exists
- Delete any partial `moneta.db` / `moneta.db-wal` / `moneta.db-shm`
- Re-run migration from step 1

**Scenario B**: Crash between steps 7-8 (connection closed, but WAL/SHM not cleaned)
- On next startup, detect `dbMigrationState = 'pending'` + `.bak` exists
- Delete any stale `moneta.db-wal` / `moneta.db-shm`
- If `moneta.db` exists and is readable with the key → skip to step 9
- If not → re-run migration from step 1

**Scenario C**: Crash between steps 9-10 (encrypted DB verified but state not yet `'done'`)
- On next startup, detect `dbMigrationState = 'pending'` but `moneta.db` opens successfully with key
- Skip to step 10 (mark done + delete backup)

**Scenario D**: No `.bak` file but state is `'pending'` (shouldn't happen, defensive handling)
- Log warning, attempt to open `moneta.db` with key
- If succeeds → mark `'done'`, continue normally
- If fails → unrecoverable error, prompt user to restore from export

### Why Not Replace-in-Place

Instead of writing to a temp file and renaming over the original, we write directly to the final `moneta.db` path via `ATTACH` + `sqlcipher_export`. This avoids:
- Windows file lock issues when renaming an open database
- The need to change `getDatabasePath()` return value
- Potential race conditions with other processes

## MCP Compatibility

MCP Server (`src/mcp/`) never imports `better-sqlite3` or `connection.ts`. All database access goes through HTTP requests to the main Electron process's MCP HTTP Server (`src/main/services/mcp-http-server.ts`), which uses the same `getDatabase()` connection. Encryption is fully transparent — zero changes needed.

Note: `connection.ts` has a standalone Node.js code path in `getDatabasePath()` (for non-Electron environments). This path is currently unused — MCP Server uses HTTP exclusively. If this path is ever needed in the future, `safeStorage` will not be available and an alternative key management mechanism would be required.

## Config Changes

`AppConfig` type gains two fields:
- `dbKeyEncrypted?: string` — the encrypted database key
- `dbMigrationState?: 'pending' | 'done'` — migration progress tracking

`loadConfig()` handles `undefined` fields with defaults, ensuring forward compatibility.

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Replace dependency |
| `src/main/database/connection.ts` | Core: key management + PRAGMAs + migration state machine |
| `src/main/services/config.service.ts` | `loadConfig()` handles `dbKeyEncrypted` and `dbMigrationState` |
| `src/shared/types/` | `AppConfig` adds `dbKeyEncrypted?` and `dbMigrationState?` |

## Files NOT Changed

All repositories, all IPC handlers, MCP server, MCP HTTP server, preload, frontend — zero changes needed.

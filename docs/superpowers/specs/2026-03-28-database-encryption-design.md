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
2. Detect if migration needed (no dbKeyEncrypted + existing moneta.db exists)
3. If migration needed: migrate plaintext → encrypted (see below)
4. Open database: new Database(dbPath)
5. Set encryption PRAGMAs:
   - PRAGMA key = "x'<hex_key>'"
   - PRAGMA cipher = 'sqleet'
   - PRAGMA cipher_page_size = 4096
   - PRAGMA kdf_iter = 256000
6. Set existing PRAGMAs:
   - PRAGMA journal_mode = WAL
   - PRAGMA foreign_keys = ON
```

## Migration: Plaintext → Encrypted

Triggered when `config.json` lacks `dbKeyEncrypted` and `moneta.db` exists.

Steps:
1. Open existing `moneta.db` in plaintext mode (no PRAGMA key)
2. Generate 32-byte key, save encrypted to `config.json`
3. Backup: rename `moneta.db` → `moneta.db.plain.bak`
4. Open `moneta.db.plain.bak`, attach new encrypted `moneta.db.enc`
5. `SELECT sqlcipher_export('moneta.db.enc')`
6. Verify: check table count and row counts match
7. Close connection, replace `moneta.db` with `moneta.db.enc`, delete WAL/SHM
8. Delete `moneta.db.plain.bak` after successful verification

Recovery:
- If `.bak` exists and encrypted DB is unreadable → restore `.bak` and re-migrate
- If crash during migration → `.bak` present, next startup detects and recovers

## MCP Compatibility

MCP Server never touches the database file. It communicates exclusively via HTTP to the main Electron process, which uses the same `getDatabase()` connection. No changes needed in `src/mcp/`.

## Config Changes

`AppConfig` type gains `dbKeyEncrypted?: string`. `loadConfig()` handles `undefined` → triggers migration on next DB open.

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Replace dependency |
| `src/main/database/connection.ts` | Core: key management + PRAGMAs + migration logic |
| `src/main/services/config.service.ts` | `loadConfig()` handles `dbKeyEncrypted` |
| `src/shared/types/` | `AppConfig` adds `dbKeyEncrypted?` |

## Files NOT Changed

All repositories, all IPC handlers, MCP server, MCP HTTP server, preload, frontend — zero changes needed.

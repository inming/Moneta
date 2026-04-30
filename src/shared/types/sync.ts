export type S3Provider = 'aws' | 'aliyun' | 'custom'

export interface S3Config {
  provider: S3Provider
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
}

export interface SyncConfig {
  enabled: boolean
  s3: S3Config
  hasCredentials: boolean
  deviceId: string
  cursor: SyncCursor | null
  lastSyncAt: string | null
  lastSyncError: string | null
  autoSyncIntervalMinutes: number
}

export interface SyncCursor {
  manifestVersion: number
  manifestEtag: string
  localSha256: string
  syncedAt: string
}

export interface SaveSyncConfigDTO {
  provider: S3Provider
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  autoSyncIntervalMinutes: number
}

export const AUTO_SYNC_INTERVAL_OPTIONS: readonly number[] = [0, 15, 30, 60]

export interface SetCredentialsDTO {
  accessKeyId: string
  secretAccessKey: string
}

export interface SyncTestResult {
  ok: boolean
  message: string
  canRead: boolean
  canWrite: boolean
}

export type SyncPhase =
  | 'idle'
  | 'preparing'
  | 'fetching-manifest'
  | 'uploading'
  | 'downloading'
  | 'finalizing'
  | 'conflict'
  | 'error'
  | 'success'

export interface SyncStatus {
  phase: SyncPhase
  message: string
  progress?: number
  lastSyncAt: string | null
  lastSyncError: string | null
}

export interface RemoteManifest {
  version: number
  writerDeviceId: string
  writtenAt: string
  schemaVersion: number
  size: number
  sha256: string
  keyFingerprint: string
  appVersion: string
}

export interface ConflictInfo {
  localChangedAt: string | null
  localSha256: string
  remote: RemoteManifest
  remoteEtag: string
}

export type ConflictResolution = 'use-remote' | 'use-local' | 'cancel'

export interface SyncRunResult {
  outcome:
    | 'noop'
    | 'uploaded'
    | 'downloaded'
    | 'initial-uploaded'
    | 'conflict'
    | 'error'
    | 'aborted'
    | 'needs-setup-initial'
    | 'needs-setup-join'
  message: string
  conflict?: ConflictInfo
  error?: string
}

export interface SyncCloudInspect {
  hasManifest: boolean
  hasKeyEnvelope: boolean
  envelopeFingerprint: string | null
  localFingerprint: string
  fingerprintMatches: boolean
  remoteVersion: number | null
  remoteWriterDeviceId: string | null
  remoteWrittenAt: string | null
  envelopeCreatedAt: string | null
}

export interface SetupSyncDTO {
  passphrase: string
}

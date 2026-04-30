import { app } from 'electron'
import type { S3Client } from '@aws-sdk/client-s3'
import {
  getJson,
  putJson,
  putIfAbsent,
  PreconditionFailedError
} from './s3Client'
import type { RemoteManifest, S3Config } from '../../../shared/types'

export const MANIFEST_KEY = 'manifest.json'
export const DB_OBJECT_KEY = 'db.sqlite.gz'

export interface ManifestSnapshot {
  body: RemoteManifest
  etag: string
}

export async function fetchManifest(
  client: S3Client,
  config: S3Config
): Promise<ManifestSnapshot | null> {
  const res = await getJson<RemoteManifest>(client, config, MANIFEST_KEY)
  if (!res) return null
  return { body: res.body, etag: res.etag }
}

export interface BuildManifestInput {
  previousVersion: number
  deviceId: string
  schemaVersion: number
  size: number
  sha256: string
  keyFingerprint: string
}

export function buildManifest(input: BuildManifestInput): RemoteManifest {
  return {
    version: input.previousVersion + 1,
    writerDeviceId: input.deviceId,
    writtenAt: new Date().toISOString(),
    schemaVersion: input.schemaVersion,
    size: input.size,
    sha256: input.sha256,
    keyFingerprint: input.keyFingerprint,
    appVersion: app.getVersion()
  }
}

/**
 * Compare-and-swap manifest write.
 * - When ifMatchEtag is provided: atomic update (precondition on ETag).
 * - When omitted: initial creation (must not exist).
 * Throws PreconditionFailedError on race.
 */
export async function commitManifest(
  client: S3Client,
  config: S3Config,
  manifest: RemoteManifest,
  ifMatchEtag?: string
): Promise<{ etag: string }> {
  if (ifMatchEtag) {
    return putJson(client, config, MANIFEST_KEY, manifest, ifMatchEtag)
  }
  return putIfAbsent(client, config, MANIFEST_KEY, manifest)
}

export { PreconditionFailedError }

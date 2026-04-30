import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3ServiceException
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { Readable } from 'stream'
import fs from 'fs'
import type { S3Config } from '../../../shared/types'

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface PutManifestResult {
  etag: string
}

export interface GetManifestResult<T> {
  body: T
  etag: string
}

export class PreconditionFailedError extends Error {
  constructor() {
    super('manifest precondition failed (CAS conflict)')
    this.name = 'PreconditionFailedError'
  }
}

export class NoSuchKeyError extends Error {
  constructor(key: string) {
    super(`object not found: ${key}`)
    this.name = 'NoSuchKeyError'
  }
}

export function createS3Client(config: S3Config, creds: S3Credentials): S3Client {
  return new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region || 'us-east-1',
    forcePathStyle: config.pathStyle,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey
    }
  })
}

function buildKey(prefix: string, key: string): string {
  const normalized = (prefix || '').replace(/^\/+/, '')
  return normalized ? `${normalized}${key}` : key
}

/**
 * Aliyun OSS's S3-compatible mode does NOT support `If-Match` / `If-None-Match`
 * on PutObject. For these providers we fall back to a head-then-put pattern
 * (slightly racy but acceptable for personal multi-device usage).
 */
function supportsConditionalPut(config: S3Config): boolean {
  if (config.provider === 'aliyun') return false
  if (/aliyuncs\.com/i.test(config.endpoint)) return false
  return true
}

export async function getJson<T>(
  client: S3Client,
  config: S3Config,
  key: string
): Promise<GetManifestResult<T> | null> {
  try {
    const cmd = new GetObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key)
    })
    const res = await client.send(cmd)
    const text = await streamToString(res.Body as Readable)
    return {
      body: JSON.parse(text) as T,
      etag: stripQuotes(res.ETag ?? '')
    }
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

export async function putJson(
  client: S3Client,
  config: S3Config,
  key: string,
  body: unknown,
  ifMatchEtag?: string
): Promise<PutManifestResult> {
  if (!supportsConditionalPut(config) && ifMatchEtag) {
    const head = await headObject(client, config, key)
    if (!head || head.etag !== ifMatchEtag) throw new PreconditionFailedError()
    return rawPutJson(client, config, key, body)
  }
  try {
    const cmd = new PutObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key),
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json',
      IfMatch: ifMatchEtag
    })
    const res = await client.send(cmd)
    return { etag: stripQuotes(res.ETag ?? '') }
  } catch (e) {
    if (isPreconditionFailed(e)) throw new PreconditionFailedError()
    throw e
  }
}

export async function putIfAbsent(
  client: S3Client,
  config: S3Config,
  key: string,
  body: unknown
): Promise<PutManifestResult> {
  if (!supportsConditionalPut(config)) {
    const head = await headObject(client, config, key)
    if (head) throw new PreconditionFailedError()
    return rawPutJson(client, config, key, body)
  }
  try {
    const cmd = new PutObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key),
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json',
      IfNoneMatch: '*'
    })
    const res = await client.send(cmd)
    return { etag: stripQuotes(res.ETag ?? '') }
  } catch (e) {
    if (isPreconditionFailed(e)) throw new PreconditionFailedError()
    throw e
  }
}

async function rawPutJson(
  client: S3Client,
  config: S3Config,
  key: string,
  body: unknown
): Promise<PutManifestResult> {
  const res = await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key),
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json'
    })
  )
  return { etag: stripQuotes(res.ETag ?? '') }
}

export async function uploadFile(
  client: S3Client,
  config: S3Config,
  key: string,
  filePath: string,
  contentType = 'application/octet-stream'
): Promise<void> {
  const stat = fs.statSync(filePath)
  if (stat.size <= 5 * 1024 * 1024) {
    const cmd = new PutObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key),
      Body: fs.readFileSync(filePath),
      ContentType: contentType,
      ContentLength: stat.size
    })
    await client.send(cmd)
    return
  }
  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key),
      Body: fs.createReadStream(filePath),
      ContentType: contentType
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024
  })
  await upload.done()
}

export async function downloadFile(
  client: S3Client,
  config: S3Config,
  key: string,
  destPath: string
): Promise<void> {
  const cmd = new GetObjectCommand({
    Bucket: config.bucket,
    Key: buildKey(config.prefix, key)
  })
  const res = await client.send(cmd)
  if (!res.Body) throw new Error('empty response body')
  await streamToFile(res.Body as Readable, destPath)
}

export async function headObject(
  client: S3Client,
  config: S3Config,
  key: string
): Promise<{ etag: string; size: number } | null> {
  try {
    const cmd = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key)
    })
    const res = await client.send(cmd)
    return {
      etag: stripQuotes(res.ETag ?? ''),
      size: res.ContentLength ?? 0
    }
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

export async function deleteObject(
  client: S3Client,
  config: S3Config,
  key: string
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: buildKey(config.prefix, key)
    })
  )
}

export async function listObjects(
  client: S3Client,
  config: S3Config,
  subPrefix: string
): Promise<{ key: string; size: number; lastModified: Date | undefined }[]> {
  const fullPrefix = buildKey(config.prefix, subPrefix)
  const out: { key: string; size: number; lastModified: Date | undefined }[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: fullPrefix,
        ContinuationToken: token
      })
    )
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue
      const relKey = obj.Key.startsWith(config.prefix) ? obj.Key.slice(config.prefix.length) : obj.Key
      out.push({ key: relKey, size: obj.Size ?? 0, lastModified: obj.LastModified })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

function streamToFile(stream: Readable, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest)
    stream.pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
    stream.on('error', reject)
  })
}

function stripQuotes(etag: string): string {
  return etag.replace(/^"|"$/g, '')
}

function isNotFound(e: unknown): boolean {
  if (e instanceof S3ServiceException) {
    return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404
  }
  return false
}

function isPreconditionFailed(e: unknown): boolean {
  if (e instanceof S3ServiceException) {
    return e.name === 'PreconditionFailed' || e.$metadata?.httpStatusCode === 412
  }
  return false
}

import crypto from 'crypto'
import type { S3Client } from '@aws-sdk/client-s3'
import { getJson, putJson, putIfAbsent, PreconditionFailedError } from './s3Client'
import type { S3Config } from '../../../shared/types'

export const KEYENV_KEY = 'keyenv.json'
const PBKDF2_ITERATIONS = 600_000
const KEY_LEN = 32

export interface KeyEnvelope {
  format: 1
  kdf: { algo: 'pbkdf2-sha256'; iterations: number; salt: string }
  cipher: { algo: 'aes-256-gcm'; iv: string; ciphertext: string; tag: string }
  keyFingerprint: string
  createdAt: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('passphrase incorrect')
    this.name = 'WrongPassphraseError'
  }
}

export function wrapDbKey(hexKey: string, passphrase: string): KeyEnvelope {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('PASSPHRASE_TOO_SHORT')
  }
  const salt = crypto.randomBytes(16)
  const derivedKey = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  const ciphertext = Buffer.concat([cipher.update(hexKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    format: 1,
    kdf: { algo: 'pbkdf2-sha256', iterations: PBKDF2_ITERATIONS, salt: salt.toString('base64') },
    cipher: {
      algo: 'aes-256-gcm',
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64')
    },
    keyFingerprint: fingerprint(hexKey),
    createdAt: new Date().toISOString()
  }
}

export function unwrapDbKey(envelope: KeyEnvelope, passphrase: string): string {
  if (envelope.format !== 1) throw new Error('UNSUPPORTED_FORMAT')
  if (envelope.kdf.algo !== 'pbkdf2-sha256') throw new Error('UNSUPPORTED_KDF')
  if (envelope.cipher.algo !== 'aes-256-gcm') throw new Error('UNSUPPORTED_CIPHER')
  const salt = Buffer.from(envelope.kdf.salt, 'base64')
  const derivedKey = crypto.pbkdf2Sync(passphrase, salt, envelope.kdf.iterations, KEY_LEN, 'sha256')
  const iv = Buffer.from(envelope.cipher.iv, 'base64')
  const ciphertext = Buffer.from(envelope.cipher.ciphertext, 'base64')
  const tag = Buffer.from(envelope.cipher.tag, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
  decipher.setAuthTag(tag)
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new WrongPassphraseError()
  }
  const hexKey = plain.toString('utf8')
  if (fingerprint(hexKey) !== envelope.keyFingerprint) {
    throw new WrongPassphraseError()
  }
  return hexKey
}

export function fingerprint(hexKey: string): string {
  return crypto.createHash('sha256').update(hexKey).digest('hex').slice(0, 32)
}

export async function fetchKeyEnvelope(
  client: S3Client,
  config: S3Config
): Promise<{ body: KeyEnvelope; etag: string } | null> {
  const res = await getJson<KeyEnvelope>(client, config, KEYENV_KEY)
  if (!res) return null
  return { body: res.body, etag: res.etag }
}

export async function putKeyEnvelope(
  client: S3Client,
  config: S3Config,
  envelope: KeyEnvelope,
  ifMatchEtag?: string
): Promise<{ etag: string }> {
  if (ifMatchEtag) {
    return putJson(client, config, KEYENV_KEY, envelope, ifMatchEtag)
  }
  return putIfAbsent(client, config, KEYENV_KEY, envelope)
}

export { PreconditionFailedError }

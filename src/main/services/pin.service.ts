import * as crypto from 'crypto'
import { loadConfig, saveConfig, encryptString, decryptString } from './config.service'
import type { VerifyPINResult, ChangePINResult } from '../../shared/types'

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 30_000

function hashPIN(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(salt + pin).digest('hex')
}

export function hasPIN(): boolean {
  const config = loadConfig()
  return config.pinEncrypted !== ''
}

export function setPIN(pin: string): void {
  const config = loadConfig()
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = hashPIN(pin, salt)
  const plainValue = `${salt}:${hash}`
  config.pinEncrypted = encryptString(plainValue)
  config.pinFailCount = 0
  config.pinLockedUntil = ''
  saveConfig(config)
}

export function verifyPIN(pin: string): VerifyPINResult {
  const config = loadConfig()

  // Check lockout
  if (config.pinLockedUntil) {
    const lockedUntil = new Date(config.pinLockedUntil).getTime()
    const now = Date.now()
    if (now < lockedUntil) {
      return { success: false, remainingAttempts: 0, lockedUntilMs: lockedUntil }
    }
    // Lockout expired, reset
    config.pinFailCount = 0
    config.pinLockedUntil = ''
  }

  const plainValue = decryptString(config.pinEncrypted)
  const [salt, storedHash] = plainValue.split(':')
  const inputHash = hashPIN(pin, salt)

  if (inputHash === storedHash) {
    config.pinFailCount = 0
    config.pinLockedUntil = ''
    saveConfig(config)
    return { success: true, remainingAttempts: MAX_ATTEMPTS }
  }

  // Wrong PIN
  config.pinFailCount += 1
  const remaining = MAX_ATTEMPTS - config.pinFailCount

  if (remaining <= 0) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
    config.pinLockedUntil = lockedUntil
    config.pinFailCount = 0
    saveConfig(config)
    return {
      success: false,
      remainingAttempts: 0,
      lockedUntilMs: new Date(lockedUntil).getTime()
    }
  }

  saveConfig(config)
  return { success: false, remainingAttempts: remaining }
}

export function getAutoLockMinutes(): number {
  const config = loadConfig()
  return config.autoLockMinutes
}

export function setAutoLockMinutes(minutes: number): void {
  const config = loadConfig()
  config.autoLockMinutes = minutes
  saveConfig(config)
}

export function changePIN(currentPin: string, newPin: string): ChangePINResult {
  const result = verifyPIN(currentPin)
  if (!result.success) {
    return { success: false }
  }
  setPIN(newPin)
  return { success: true }
}

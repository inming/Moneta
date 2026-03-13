export interface VerifyPINResult {
  success: boolean
  remainingAttempts: number
  lockedUntilMs?: number
}

export interface ChangePINResult {
  success: boolean
}

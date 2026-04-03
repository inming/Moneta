import type Database from 'better-sqlite3-multiple-ciphers'
import type { ForecastParams, ForecastResult, ForecastMonthData } from '../../shared/types'
import * as statsRepo from '../database/repositories/stats.repo'

const DECAY_FACTOR = 0.7

// --- Cache for historical annual data (past years never change) ---
// Key: 'all' | category_id string, Value: Map<category_id, Map<year, total>>
let historyCache: Map<number, Map<number, number>> | null = null
let historyCacheYear: number | null = null

export function invalidateCache(): void {
  historyCache = null
  historyCacheYear = null
}

function getHistoryWithCache(db: Database.Database, currentYear: number): Map<number, Map<number, number>> {
  if (historyCache && historyCacheYear === currentYear) {
    return historyCache
  }

  // Query all categories at once (no category filter), cache the full result
  historyCache = statsRepo.getExpenseAnnualHistory(db)
  historyCacheYear = currentYear

  // Remove current year from cache — it's mutable, will be queried fresh via actualMonthly
  for (const yearMap of historyCache.values()) {
    yearMap.delete(currentYear)
  }

  return historyCache
}

function filterHistoryByCategory(
  fullHistory: Map<number, Map<number, number>>,
  categoryId?: number
): Map<number, Map<number, number>> {
  if (categoryId === undefined) return fullHistory

  const filtered = new Map<number, Map<number, number>>()
  const catHistory = fullHistory.get(categoryId)
  if (catHistory) {
    filtered.set(categoryId, catHistory)
  }
  return filtered
}

function computeWeightedAverage(yearTotals: Map<number, number>, currentYear: number): number {
  const years = Array.from(yearTotals.keys())
    .filter((y) => y < currentYear)
    .sort((a, b) => b - a)

  if (years.length === 0) return 0

  let weightSum = 0
  let valueSum = 0
  let weight = 1.0

  for (const year of years) {
    const total = yearTotals.get(year)!
    valueSum += total * weight
    weightSum += weight
    weight *= DECAY_FACTOR
  }

  return valueSum / weightSum
}

function computeCategoryForecast(
  annualHistory: Map<number, number>,
  actualMonths: number[],
  currentYear: number,
  currentMonth: number
): ForecastMonthData[] {
  const predictedAnnual =
    computeWeightedAverage(annualHistory, currentYear) ||
    computeYTDBasedAnnual(actualMonths, currentMonth)

  const actualYTD = actualMonths.slice(0, currentMonth).reduce((sum, v) => sum + v, 0)
  const remainingMonthCount = 12 - currentMonth

  let perMonth = 0
  if (remainingMonthCount > 0 && predictedAnnual > 0) {
    const remaining = predictedAnnual - actualYTD
    const historicalMonthly = predictedAnnual / 12
    perMonth = Math.max(remaining / remainingMonthCount, historicalMonthly)
  }

  const months: ForecastMonthData[] = []
  for (let i = 0; i < 12; i++) {
    if (i < currentMonth) {
      months.push({ amount: actualMonths[i], isActual: true })
    } else {
      months.push({ amount: perMonth, isActual: false })
    }
  }

  return months
}

function computeYTDBasedAnnual(actualMonths: number[], currentMonth: number): number {
  if (currentMonth === 0) return 0
  const ytdTotal = actualMonths.slice(0, currentMonth).reduce((sum, v) => sum + v, 0)
  if (ytdTotal === 0) return 0
  return (ytdTotal / currentMonth) * 12
}

export function computeForecast(db: Database.Database, params: ForecastParams): ForecastResult {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  // Historical data: cached (past years are immutable)
  const fullHistory = getHistoryWithCache(db, currentYear)
  const annualHistoryByCat = filterHistoryByCategory(fullHistory, params.category_id)

  // Current year actual data: always fresh
  const actualMonthlybyCat = statsRepo.getActualMonthlyExpense(db, currentYear, params.category_id)

  // Collect all category IDs from both sources
  const allCategoryIds = new Set<number>([
    ...annualHistoryByCat.keys(),
    ...actualMonthlybyCat.keys()
  ])

  if (allCategoryIds.size === 0) {
    const emptyMonths: ForecastMonthData[] = Array.from({ length: 12 }, (_, i) => ({
      amount: 0,
      isActual: i < currentMonth
    }))
    return { months: emptyMonths, totalForecast: 0 }
  }

  // Compute forecast for each category, then sum
  const aggregatedMonths: ForecastMonthData[] = Array.from({ length: 12 }, (_, i) => ({
    amount: 0,
    isActual: i < currentMonth
  }))

  for (const catId of allCategoryIds) {
    const annualHistory = annualHistoryByCat.get(catId) ?? new Map<number, number>()
    const actualMonths = actualMonthlybyCat.get(catId) ?? new Array<number>(12).fill(0)

    const catForecast = computeCategoryForecast(annualHistory, actualMonths, currentYear, currentMonth)

    for (let i = 0; i < 12; i++) {
      aggregatedMonths[i].amount += catForecast[i].amount
    }
  }

  const totalForecast = aggregatedMonths.reduce((sum, m) => sum + m.amount, 0)

  return { months: aggregatedMonths, totalForecast }
}

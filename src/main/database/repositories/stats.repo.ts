import type Database from 'better-sqlite3'
import type { CrossTableParams, CrossTableData, CrossTableRow, SummaryParams, SummaryData, YearRangeData, YearlyCategoryParams, YearlyCategoryData } from '../../../shared/types'

interface CrossTableRawRow {
  category_id: number
  category_name: string
  month_num: number
  total: number
}

export function getCrossTable(db: Database.Database, params: CrossTableParams): CrossTableData {
  const { year, type, operator_id } = params

  let sql = `
    SELECT t.category_id, c.name AS category_name,
           CAST(strftime('%m', t.date) AS INTEGER) AS month_num,
           SUM(t.amount) AS total
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.date BETWEEN ? AND ?
      AND t.type = ?
  `
  const sqlParams: unknown[] = [`${year}-01-01`, `${year}-12-31`, type]

  if (operator_id !== undefined) {
    sql += ' AND t.operator_id = ?'
    sqlParams.push(operator_id)
  }

  sql += ' GROUP BY t.category_id, month_num ORDER BY c.sort_order ASC'

  const rawRows = db.prepare(sql).all(...sqlParams) as CrossTableRawRow[]

  // Pivot: group by category
  const categoryMap = new Map<number, CrossTableRow>()

  for (const raw of rawRows) {
    let row = categoryMap.get(raw.category_id)
    if (!row) {
      row = {
        category_id: raw.category_id,
        category_name: raw.category_name,
        months: new Array<number>(12).fill(0),
        yearly: 0
      }
      categoryMap.set(raw.category_id, row)
    }
    row.months[raw.month_num - 1] = raw.total
  }

  const rows = Array.from(categoryMap.values())

  // Calculate yearly for each row and totals
  const totalMonths = new Array<number>(12).fill(0)
  let totalYearly = 0

  for (const row of rows) {
    row.yearly = row.months.reduce((sum, v) => sum + v, 0)
    for (let i = 0; i < 12; i++) {
      totalMonths[i] += row.months[i]
    }
    totalYearly += row.yearly
  }

  return {
    rows,
    totals: {
      months: totalMonths,
      yearly: totalYearly
    }
  }
}

export function getSummary(db: Database.Database, params: SummaryParams): SummaryData {
  const { year, month, type, operator_id } = params

  const sumAmount = (dateFrom: string, dateTo: string): number => {
    let sql = 'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date BETWEEN ? AND ? AND type = ?'
    const sqlParams: unknown[] = [dateFrom, dateTo, type]
    if (operator_id !== undefined) {
      sql += ' AND operator_id = ?'
      sqlParams.push(operator_id)
    }
    const result = db.prepare(sql).get(...sqlParams) as { total: number }
    return result.total
  }

  // Current month
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const currentMonth = sumAmount(`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)

  // Last month (handles January → previous year December)
  let lastMonthYear = year
  let lastMonthNum = month - 1
  if (lastMonthNum === 0) {
    lastMonthNum = 12
    lastMonthYear = year - 1
  }
  const lmm = String(lastMonthNum).padStart(2, '0')
  const lastDayLM = new Date(lastMonthYear, lastMonthNum, 0).getDate()
  const lastMonth = sumAmount(
    `${lastMonthYear}-${lmm}-01`,
    `${lastMonthYear}-${lmm}-${String(lastDayLM).padStart(2, '0')}`
  )

  // Year total
  const yearTotal = sumAmount(`${year}-01-01`, `${year}-12-31`)

  return { currentMonth, lastMonth, yearTotal }
}

interface YearlyCategoryRawRow {
  year_num: number
  category_id: number
  category_name: string
  total: number
}

export function getYearlyCategory(db: Database.Database, params: YearlyCategoryParams): YearlyCategoryData {
  const { type, operator_id } = params

  let sql = `
    SELECT CAST(strftime('%Y', t.date) AS INTEGER) AS year_num,
           t.category_id, c.name AS category_name,
           SUM(t.amount) AS total
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.type = ?
  `
  const sqlParams: unknown[] = [type]

  if (operator_id !== undefined) {
    sql += ' AND t.operator_id = ?'
    sqlParams.push(operator_id)
  }

  sql += ' GROUP BY year_num, t.category_id ORDER BY year_num ASC, c.sort_order ASC'

  const rawRows = db.prepare(sql).all(...sqlParams) as YearlyCategoryRawRow[]

  // Collect unique categories in order of first appearance (respects sort_order)
  const categoryMap = new Map<number, { id: number; name: string }>()
  for (const raw of rawRows) {
    if (!categoryMap.has(raw.category_id)) {
      categoryMap.set(raw.category_id, { id: raw.category_id, name: raw.category_name })
    }
  }
  const categories = Array.from(categoryMap.values())
  const catIndexMap = new Map<number, number>()
  categories.forEach((c, i) => catIndexMap.set(c.id, i))

  // Pivot by year
  const yearMap = new Map<number, number[]>()
  for (const raw of rawRows) {
    let amounts = yearMap.get(raw.year_num)
    if (!amounts) {
      amounts = new Array<number>(categories.length).fill(0)
      yearMap.set(raw.year_num, amounts)
    }
    amounts[catIndexMap.get(raw.category_id)!] = raw.total
  }

  const rows = Array.from(yearMap.entries()).map(([year, amounts]) => ({
    year,
    amounts,
    yearly: amounts.reduce((sum, v) => sum + v, 0)
  }))

  // Totals
  const totalAmounts = new Array<number>(categories.length).fill(0)
  let totalYearly = 0
  for (const row of rows) {
    for (let i = 0; i < categories.length; i++) {
      totalAmounts[i] += row.amounts[i]
    }
    totalYearly += row.yearly
  }

  return {
    categories,
    rows,
    totals: { amounts: totalAmounts, yearly: totalYearly }
  }
}

export function getYearRange(db: Database.Database): YearRangeData {
  const result = db.prepare(`
    SELECT MIN(CAST(strftime('%Y', date) AS INTEGER)) AS minYear,
           MAX(CAST(strftime('%Y', date) AS INTEGER)) AS maxYear
    FROM transactions
  `).get() as { minYear: number | null; maxYear: number | null }

  const currentYear = new Date().getFullYear()
  return {
    minYear: result.minYear ?? currentYear,
    maxYear: result.maxYear ?? currentYear
  }
}

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getDatabase } from '../database/connection'
import * as statsRepo from '../database/repositories/stats.repo'
import * as forecastService from '../services/forecast.service'
import type { CrossTableParams, SummaryParams, YearlyCategoryParams, ForecastParams } from '../../shared/types'

export function registerStatsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.STATS_CROSS_TABLE, (_event, params: CrossTableParams) => {
    const db = getDatabase()
    return statsRepo.getCrossTable(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.STATS_SUMMARY, (_event, params: SummaryParams) => {
    const db = getDatabase()
    return statsRepo.getSummary(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.STATS_YEARLY_CATEGORY, (_event, params: YearlyCategoryParams) => {
    const db = getDatabase()
    return statsRepo.getYearlyCategory(db, params)
  })

  ipcMain.handle(IPC_CHANNELS.STATS_YEAR_RANGE, () => {
    const db = getDatabase()
    return statsRepo.getYearRange(db)
  })

  ipcMain.handle(IPC_CHANNELS.STATS_FORECAST, (_event, params: ForecastParams) => {
    const db = getDatabase()
    return forecastService.computeForecast(db, params)
  })
}

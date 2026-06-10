use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use chrono::Datelike;
use rusqlite::Connection;

use crate::db::repo::stats;
use crate::error::AppResult;
use crate::models::{ForecastMonthData, ForecastParams, ForecastResult};

const DECAY_FACTOR: f64 = 0.7;

/// Map<category_id, Map<year, total>>
type AnnualHistory = HashMap<i64, HashMap<i32, f64>>;

/// 历史年度数据缓存（往年数据不可变）；交易变更时失效
#[derive(Default)]
pub struct ForecastCache(pub Mutex<Option<(i32, AnnualHistory)>>);

impl ForecastCache {
    pub fn invalidate(&self) {
        *self.0.lock().unwrap() = None;
    }
}

fn get_history_with_cache(
    cache: &ForecastCache,
    conn: &Connection,
    current_year: i32,
) -> AppResult<HashMap<i64, HashMap<i32, f64>>> {
    {
        let guard = cache.0.lock().unwrap();
        if let Some((year, history)) = guard.as_ref() {
            if *year == current_year {
                return Ok(history.clone());
            }
        }
    }

    let mut history = stats::get_expense_annual_history(conn, None)?;
    // 当年数据可变，从缓存剔除（经 actualMonthly 实时查询）
    for year_map in history.values_mut() {
        year_map.remove(&current_year);
    }
    *cache.0.lock().unwrap() = Some((current_year, history.clone()));
    Ok(history)
}

fn compute_weighted_average(year_totals: &HashMap<i32, f64>, current_year: i32) -> f64 {
    let mut years: Vec<i32> = year_totals.keys().copied().filter(|y| *y < current_year).collect();
    years.sort_unstable_by(|a, b| b.cmp(a));

    if years.is_empty() {
        return 0.0;
    }

    let mut weight_sum = 0.0;
    let mut value_sum = 0.0;
    let mut weight = 1.0;
    for year in years {
        value_sum += year_totals[&year] * weight;
        weight_sum += weight;
        weight *= DECAY_FACTOR;
    }
    value_sum / weight_sum
}

fn compute_ytd_based_annual(actual_months: &[f64], completed_months: usize) -> f64 {
    if completed_months == 0 {
        return 0.0;
    }
    let ytd_total: f64 = actual_months[..completed_months].iter().sum();
    if ytd_total == 0.0 {
        return 0.0;
    }
    (ytd_total / completed_months as f64) * 12.0
}

fn compute_category_forecast(
    annual_history: &HashMap<i32, f64>,
    actual_months: &[f64],
    current_year: i32,
    current_month: u32,
) -> Vec<ForecastMonthData> {
    let completed_months = (current_month - 1) as usize;
    let weighted = compute_weighted_average(annual_history, current_year);
    let predicted_annual = if weighted != 0.0 {
        weighted
    } else {
        compute_ytd_based_annual(actual_months, completed_months)
    };

    let completed_ytd: f64 = actual_months[..completed_months].iter().sum();
    let remaining_month_count = 12 - completed_months;

    let mut per_month = 0.0;
    if remaining_month_count > 0 && predicted_annual > 0.0 {
        let remaining = predicted_annual - completed_ytd;
        let historical_monthly = predicted_annual / 12.0;
        per_month = (remaining / remaining_month_count as f64).max(historical_monthly);
    }

    let current_month_idx = (current_month - 1) as usize;
    (0..12)
        .map(|i| {
            if i < completed_months {
                ForecastMonthData { amount: actual_months[i], is_actual: true }
            } else if i == current_month_idx {
                ForecastMonthData { amount: actual_months[i].max(per_month), is_actual: true }
            } else {
                ForecastMonthData { amount: per_month, is_actual: false }
            }
        })
        .collect()
}

pub fn compute_forecast(
    cache: &ForecastCache,
    conn: &Connection,
    params: &ForecastParams,
) -> AppResult<ForecastResult> {
    let now = chrono::Local::now();
    let current_year = now.year();
    let current_month = now.month(); // 1-12

    let full_history = get_history_with_cache(cache, conn, current_year)?;
    let annual_history_by_cat: HashMap<i64, HashMap<i32, f64>> = match params.category_id {
        Some(id) => full_history
            .get(&id)
            .map(|h| HashMap::from([(id, h.clone())]))
            .unwrap_or_default(),
        None => full_history,
    };

    let actual_monthly_by_cat = stats::get_actual_monthly_expense(conn, current_year, params.category_id)?;

    let all_category_ids: HashSet<i64> = annual_history_by_cat
        .keys()
        .chain(actual_monthly_by_cat.keys())
        .copied()
        .collect();

    let mut aggregated: Vec<ForecastMonthData> = (0..12)
        .map(|i| ForecastMonthData { amount: 0.0, is_actual: (i as u32) < current_month })
        .collect();

    if all_category_ids.is_empty() {
        return Ok(ForecastResult { months: aggregated, total_forecast: 0.0 });
    }

    let empty_history = HashMap::new();
    let empty_months = vec![0.0; 12];
    for cat_id in all_category_ids {
        let annual_history = annual_history_by_cat.get(&cat_id).unwrap_or(&empty_history);
        let actual_months = actual_monthly_by_cat.get(&cat_id).unwrap_or(&empty_months);
        let cat_forecast =
            compute_category_forecast(annual_history, actual_months, current_year, current_month);
        for i in 0..12 {
            aggregated[i].amount += cat_forecast[i].amount;
        }
    }

    let total_forecast = aggregated.iter().map(|m| m.amount).sum();
    Ok(ForecastResult { months: aggregated, total_forecast })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weighted_average_decays() {
        let totals = HashMap::from([(2024, 1200.0), (2023, 600.0)]);
        // (1200*1 + 600*0.7) / (1 + 0.7) = 1620/1.7
        let avg = compute_weighted_average(&totals, 2025);
        assert!((avg - 1620.0 / 1.7).abs() < 1e-9);
        // 当前年份的数据不参与
        let with_current = HashMap::from([(2025, 9999.0), (2024, 1200.0), (2023, 600.0)]);
        assert!((compute_weighted_average(&with_current, 2025) - avg).abs() < 1e-9);
    }

    #[test]
    fn ytd_fallback() {
        assert_eq!(compute_ytd_based_annual(&[100.0, 100.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 2), 1200.0);
        assert_eq!(compute_ytd_based_annual(&[0.0; 12], 0), 0.0);
    }
}

import {
  HISTORY_TERMS,
  ID_PREFIXES,
  TARGET_TERM,
  makeTermId,
  type ConfidenceLevel,
  type Course,
  type DemandForecast,
  type ForecastEvaluationRow,
  type ForecastMetrics,
  type RegistrationInterest,
  type TermCode,
} from '@yottaflex/shared';
import { insertBatched } from '../db.js';
import { DemandForecastModel } from '../models/index.js';

export const FORECAST_METHOD = 'WMA(0.5,0.3,0.2)+Trend(0.1)';
const TREND_FACTOR = 0.1;
const TREND_CAP_RATIO = 0.25;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countDemand(
  interests: readonly RegistrationInterest[],
  term: TermCode,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const interest of interests) {
    if (interest.term !== term || interest.interest_status === 'Cancelled') {
      continue;
    }
    counts.set(interest.course_id, (counts.get(interest.course_id) ?? 0) + 1);
  }
  return counts;
}

function confidenceFor(values: readonly number[]): ConfidenceLevel {
  const mean = average([...values]);
  if (mean <= 0) {
    return 'High';
  }
  const variance = average(values.map((value) => (value - mean) ** 2));
  const coefficient = Math.sqrt(variance) / mean;
  if (coefficient < 0.15) {
    return 'High';
  }
  if (coefficient < 0.35) {
    return 'Medium';
  }
  return 'Low';
}

export function buildForecasts(
  courses: readonly Course[],
  interests: readonly RegistrationInterest[],
  asOf: string,
): DemandForecast[] {
  const [historyTerm1, historyTerm2, historyTerm3] = HISTORY_TERMS;
  const demandByTerm = new Map<TermCode, Map<string, number>>();
  for (const term of HISTORY_TERMS) {
    demandByTerm.set(term, countDemand(interests, term));
  }

  const sortedCourses = courses
    .filter((course) => course.status === 'Active')
    .sort((left, right) => left._id.localeCompare(right._id));

  return sortedCourses.map((course, index) => {
    const histDemand1 = demandByTerm.get(historyTerm1)?.get(course._id) ?? 0;
    const histDemand2 = demandByTerm.get(historyTerm2)?.get(course._id) ?? 0;
    const histDemand3 = demandByTerm.get(historyTerm3)?.get(course._id) ?? 0;

    const weightedAverage = round2(
      histDemand3 * 0.5 + histDemand2 * 0.3 + histDemand1 * 0.2,
    );
    const rawTrend = (histDemand3 - histDemand2) * TREND_FACTOR;
    const trendCap = weightedAverage * TREND_CAP_RATIO;
    const trendAdjustment = round2(
      Math.max(-trendCap, Math.min(trendCap, rawTrend)),
    );
    const forecastEnrollment = Math.max(
      0,
      Math.round(weightedAverage + trendAdjustment),
    );

    return {
      _id: makeTermId(
        ID_PREFIXES.demandForecast,
        TARGET_TERM.slice(0, 4),
        index + 1,
      ),
      course_id: course._id,
      term: TARGET_TERM,
      history_term_1: historyTerm1,
      history_term_2: historyTerm2,
      history_term_3: historyTerm3,
      hist_demand_1: histDemand1,
      hist_demand_2: histDemand2,
      hist_demand_3: histDemand3,
      weighted_average: weightedAverage,
      trend_adjustment: trendAdjustment,
      forecast_enrollment: forecastEnrollment,
      confidence: confidenceFor([histDemand1, histDemand2, histDemand3]),
      method: FORECAST_METHOD,
      computed_at: asOf,
    };
  });
}

export function computeForecastMetrics(
  forecasts: readonly DemandForecast[],
  interests: readonly RegistrationInterest[],
  asOf: string,
): ForecastMetrics {
  const actualByCourse = countDemand(interests, TARGET_TERM);
  const rows: ForecastEvaluationRow[] = [...forecasts]
    .sort((left, right) => left.course_id.localeCompare(right.course_id))
    .map((forecast) => {
      const actual = actualByCourse.get(forecast.course_id) ?? 0;
      return {
        course_id: forecast.course_id,
        forecast: forecast.forecast_enrollment,
        actual,
        naive: forecast.hist_demand_3,
        error: forecast.forecast_enrollment - actual,
      };
    });

  const mae = average(rows.map((row) => Math.abs(row.error)));
  const rmse = Math.sqrt(average(rows.map((row) => row.error ** 2)));
  const mapeRows = rows.filter((row) => row.actual > 0);
  const mape =
    mapeRows.length > 0
      ? average(mapeRows.map((row) => Math.abs(row.error) / row.actual)) * 100
      : 0;
  const bias = average(rows.map((row) => row.error));
  const naiveMae = average(rows.map((row) => Math.abs(row.naive - row.actual)));
  const improvement =
    naiveMae > 0 ? ((naiveMae - mae) / naiveMae) * 100 : 0;

  return {
    term: TARGET_TERM,
    method: forecasts[0]?.method ?? FORECAST_METHOD,
    course_count: rows.length,
    mae: round2(mae),
    rmse: round2(rmse),
    mape: round2(mape),
    bias: round2(bias),
    naive_mae: round2(naiveMae),
    improvement_vs_naive: round2(improvement),
    generated_at: asOf,
    per_course: rows,
  };
}

export async function persistForecasts(
  forecasts: readonly DemandForecast[],
): Promise<number> {
  await DemandForecastModel.deleteMany({});
  return insertBatched(DemandForecastModel, [...forecasts]);
}

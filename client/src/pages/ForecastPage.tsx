import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DemandForecast, ForecastMetrics } from '@yottaflex/shared';
import { apiData, apiList } from '../api';
import {
  DataTable,
  ErrorState,
  LoadingState,
  MetricCard,
  SectionCard,
  formatNumber,
  formatPercent,
} from '../components/ui';

export function ForecastPage() {
  const [metrics, setMetrics] = useState<ForecastMetrics | null>(null);
  const [rows, setRows] = useState<DemandForecast[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiData<ForecastMetrics>('/metrics/forecast'),
      apiList<DemandForecast>('/forecasts', {
        pageSize: 100,
        sort: 'forecast_enrollment',
        order: 'desc',
      }),
    ])
      .then(([metricsResponse, listResponse]) => {
        if (active) {
          setMetrics(metricsResponse.data);
          setRows(listResponse.data);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Unknown error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!metrics) {
    return <LoadingState label="Loading forecasts..." />;
  }

  const chartRows = rows.slice(0, 18).map((row) => ({
    course: row.course_id,
    forecast: row.forecast_enrollment,
    history: row.hist_demand_3,
  }));
  const confidenceCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.confidence] = (acc[row.confidence] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Forecast method"
          value={metrics.method}
          hint={`${formatNumber(metrics.course_count)} active courses`}
        />
        <MetricCard label="MAE" value={formatNumber(metrics.mae, 2)} tone="positive" />
        <MetricCard label="RMSE" value={formatNumber(metrics.rmse, 2)} />
        <MetricCard label="MAPE" value={formatPercent(metrics.mape)} />
        <MetricCard label="Bias" value={formatNumber(metrics.bias, 2)} />
        <MetricCard
          label="Improvement vs naive"
          value={formatPercent(metrics.improvement_vs_naive)}
          hint={`Naive MAE ${formatNumber(metrics.naive_mae, 2)}`}
          tone="positive"
        />
      </div>

      <div className="two-column">
        <SectionCard
          title="Demand signal"
          subtitle="Top courses by forecast; history is the most recent Fall term"
        >
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="course"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-35}
                  height={62}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="history" name="2025-Fall demand" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="forecast" name="2026-Fall forecast" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Confidence profile" subtitle="Coefficient of variation across history">
          <div className="confidence-list">
            {['High', 'Medium', 'Low'].map((level) => {
              const count = confidenceCounts[level] ?? 0;
              const width = rows.length > 0 ? (count / rows.length) * 100 : 0;
              return (
                <div key={level} className="confidence-row">
                  <div>
                    <strong>{level}</strong>
                    <span>{count} courses</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill confidence-${level.toLowerCase()}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span>{formatPercent(width)}</span>
                </div>
              );
            })}
          </div>
          <div className="explain-box">
            <strong>Weighted moving average</strong>
            <p>
              The forecast uses weights 0.5, 0.3, and 0.2 over the three historical Fall terms,
              then adds a capped 10% trend adjustment. Target-term registration interest is never
              used as an input.
            </p>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Forecast records"
        subtitle="Sorted by forecast enrollment descending"
      >
        <DataTable<DemandForecast>
          columns={[
            { key: 'id', header: 'Forecast ID', render: (row) => row._id },
            { key: 'course', header: 'Course', render: (row) => row.course_id },
            {
              key: 'history',
              header: '2023 / 2024 / 2025',
              render: (row) => `${row.hist_demand_1} / ${row.hist_demand_2} / ${row.hist_demand_3}`,
            },
            {
              key: 'weighted',
              header: 'Weighted avg',
              render: (row) => formatNumber(row.weighted_average, 2),
            },
            {
              key: 'trend',
              header: 'Trend adj.',
              render: (row) => formatNumber(row.trend_adjustment, 2),
            },
            {
              key: 'forecast',
              header: 'Forecast',
              render: (row) => <strong>{row.forecast_enrollment}</strong>,
            },
            { key: 'confidence', header: 'Confidence', render: (row) => row.confidence },
          ]}
          rows={rows}
          getKey={(row) => row._id}
        />
      </SectionCard>
    </div>
  );
}

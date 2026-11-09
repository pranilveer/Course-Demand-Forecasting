import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ValidationCheckSummary } from '@yottaflex/shared';
import { apiData, type SummaryResponse } from '../api';
import {
  DataTable,
  ErrorState,
  LoadingState,
  MetricCard,
  SectionCard,
  StatusBadge,
  formatNumber,
  formatPercent,
} from '../components/ui';

const PIE_COLORS = ['#0f766e', '#f59e0b', '#dc2626', '#6366f1', '#0891b2'];

export function OverviewPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiData<SummaryResponse>('/summary')
      .then((response) => {
        if (active) {
          setSummary(response.data);
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
  if (!summary) {
    return <LoadingState label="Loading summary..." />;
  }

  const validation = summary.validation;
  const checks = validation?.summary.checks ?? [];
  const unmetRows = Object.entries(summary.allocation.unmet_by_reason).map(
    ([reason, count]) => ({ reason, count }),
  );
  const topForecasts = [...summary.forecast.per_course]
    .sort((left, right) => right.forecast - left.forecast)
    .slice(0, 14)
    .map((row) => ({
      course: row.course_id,
      forecast: row.forecast,
      actual: row.actual,
      naive: row.naive,
    }));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Validation-gated pipeline</p>
          <h2>
            {validation?.summary.status === 'PASS'
              ? 'Dataset is ready for review'
              : 'Validation needs attention'}
          </h2>
          <p>
            The dashboard reads the deterministic starter database. Use the CLI to regenerate,
            validate, export, or reproduce the dataset.
          </p>
        </div>
        <div className="hero-status">
          <StatusBadge status={validation?.summary.status ?? 'Not run'} />
          <span>
            {validation?.summary.anomalies_detected ?? 0} of{' '}
            {validation?.summary.anomalies_expected ?? 0} anomalies detected
          </span>
        </div>
      </section>

      <div className="metric-grid">
        <MetricCard
          label="Forecast MAE"
          value={formatNumber(summary.forecast.mae, 2)}
          hint={`${formatPercent(summary.forecast.improvement_vs_naive)} better than naive`}
          tone="positive"
        />
        <MetricCard
          label="Demand met"
          value={formatPercent(summary.allocation.demand_met_pct)}
          hint={`${formatNumber(summary.allocation.forecast_total)} forecast students`}
        />
        <MetricCard
          label="Unmet demand"
          value={formatNumber(summary.allocation.unmet_total)}
          hint={`${formatNumber(summary.allocation.section_count)} sections allocated`}
          tone={summary.allocation.unmet_total > 0 ? 'negative' : 'positive'}
        />
        <MetricCard
          label="Skill match"
          value={formatPercent(summary.allocation.skill_match_pct)}
          hint={`${formatNumber(summary.allocation.faculty_count)} faculty assigned`}
        />
        <MetricCard
          label="Explainability"
          value={formatPercent(summary.allocation.explainability_pct)}
          hint={`${formatNumber(summary.allocation.decision_count)} decisions recorded`}
        />
        <MetricCard
          label="Expected violations"
          value={formatNumber(validation?.summary.expected_violations ?? 0)}
          hint={`${validation?.summary.unexpected_violations ?? 0} unexpected`}
          tone={
            (validation?.summary.unexpected_violations ?? 0) > 0 ? 'negative' : 'positive'
          }
        />
      </div>

      <div className="two-column">
        <SectionCard
          title="Forecast versus actual demand"
          subtitle="Top courses by forecast enrollment in the target term"
        >
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topForecasts} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="course" tick={{ fontSize: 10 }} interval={0} angle={-35} height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="forecast" name="Forecast" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Unmet demand reasons" subtitle="Students who could not be placed">
          {unmetRows.length === 0 ? (
            <p className="empty-state">No unmet demand.</p>
          ) : (
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={unmetRows}
                    dataKey="count"
                    nameKey="reason"
                    innerRadius={62}
                    outerRadius={105}
                    paddingAngle={3}
                  >
                    {unmetRows.map((row, index) => (
                      <Cell key={row.reason} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="two-column">
        <SectionCard title="Collection footprint" subtitle="Rows persisted in MongoDB">
          <div className="count-grid">
            {Object.entries(summary.counts)
              .filter(([, count]) => count > 0)
              .map(([name, count]) => (
                <div key={name} className="count-item">
                  <span>{name}</span>
                  <strong>{formatNumber(count)}</strong>
                </div>
              ))}
          </div>
        </SectionCard>

        <SectionCard title="Validation checks" subtitle="Latest persisted validation run">
          <DataTable<ValidationCheckSummary>
            columns={[
              { key: 'check', header: 'Check', render: (row) => row.check_id },
              { key: 'name', header: 'Name', render: (row) => row.name },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
              { key: 'violations', header: 'Violations', render: (row) => row.violations },
            ]}
            rows={checks}
            getKey={(row) => row.check_id}
            emptyMessage="No validation run found."
          />
        </SectionCard>
      </div>
    </div>
  );
}

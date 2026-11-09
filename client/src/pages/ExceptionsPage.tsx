import { useEffect, useState } from 'react';
import type {
  GroundTruthAnomaly,
  UnmetDemand,
  ValidationRun,
  ValidationViolation,
} from '@yottaflex/shared';
import { apiData, apiList } from '../api';
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

export function ExceptionsPage() {
  const [validation, setValidation] = useState<ValidationRun | null>(null);
  const [anomalies, setAnomalies] = useState<GroundTruthAnomaly[]>([]);
  const [unmet, setUnmet] = useState<UnmetDemand[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiData<ValidationRun | null>('/validation/latest'),
      apiList<GroundTruthAnomaly>('/exceptions/ground-truth', { pageSize: 100 }),
      apiList<UnmetDemand>('/unmet-demand', {
        pageSize: 100,
        sort: 'unmet_count',
        order: 'desc',
      }),
    ])
      .then(([validationResponse, anomalyResponse, unmetResponse]) => {
        if (active) {
          setValidation(validationResponse.data);
          setAnomalies(anomalyResponse.data);
          setUnmet(unmetResponse.data);
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
  if (!validation) {
    return <LoadingState label="Loading validation results..." />;
  }

  const summary = validation.summary;
  const detectedRules = new Set(
    summary.checks.filter((check) => check.violations > 0).map((check) => check.check_id),
  );

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Validation status"
          value={<StatusBadge status={summary.status} />}
          hint={`${summary.total_checks} checks executed`}
          tone={summary.status === 'PASS' ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Expected violations"
          value={formatNumber(summary.expected_violations)}
          hint={`${formatNumber(summary.unexpected_violations)} unexpected`}
          tone={summary.unexpected_violations === 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Anomalies detected"
          value={`${summary.anomalies_detected}/${summary.anomalies_expected}`}
          hint={`${formatPercent(summary.detection_rate)} detection rate`}
          tone={summary.anomalies_missed === 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Total violations"
          value={formatNumber(summary.total_violations)}
          hint={`Run ${validation.run_id}`}
        />
      </div>

      <SectionCard
        title="Injected ground truth"
        subtitle="Each anomaly maps to an expected validation rule"
      >
        <DataTable<GroundTruthAnomaly>
          columns={[
            { key: 'id', header: 'Anomaly', render: (row) => row._id },
            { key: 'issue', header: 'Issue type', render: (row) => row.issue_type },
            {
              key: 'entity',
              header: 'Entity',
              render: (row) => `${row.entity_type}: ${row.entity_id}`,
            },
            { key: 'rule', header: 'Expected rule', render: (row) => row.expected_rule },
            {
              key: 'coverage',
              header: 'Coverage',
              render: (row) => (
                <StatusBadge status={detectedRules.has(row.expected_rule) ? 'Detected' : 'Missed'} />
              ),
            },
            { key: 'severity', header: 'Severity', render: (row) => row.severity },
          ]}
          rows={anomalies}
          getKey={(row) => row._id}
        />
      </SectionCard>

      <div className="two-column">
        <SectionCard title="Validation checks" subtitle="All rule outcomes">
          <DataTable
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
            rows={summary.checks}
            getKey={(row) => row.check_id}
          />
        </SectionCard>

        <SectionCard title="Detected violations" subtitle="Violations persisted in the latest run">
          <DataTable<ValidationViolation>
            columns={[
              { key: 'check', header: 'Check', render: (row) => row.check_id },
              { key: 'entity', header: 'Entity', render: (row) => row.entity_id },
              {
                key: 'expected',
                header: 'Expected',
                render: (row) => (row.expected ? 'Yes' : 'No'),
              },
              { key: 'message', header: 'Message', render: (row) => row.message },
            ]}
            rows={validation.violations}
            getKey={(row) => `${row.check_id}:${row.entity_id}:${row.message}`}
            emptyMessage="No violations detected."
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Unmet demand records"
        subtitle="Forecast demand that could not be placed"
      >
        <DataTable<UnmetDemand>
          columns={[
            { key: 'id', header: 'Record', render: (row) => row._id },
            { key: 'course', header: 'Course', render: (row) => row.course_id },
            {
              key: 'forecast',
              header: 'Forecast',
              render: (row) => row.forecast_enrollment,
            },
            {
              key: 'capacity',
              header: 'Allocated',
              render: (row) => row.allocated_capacity,
            },
            {
              key: 'unmet',
              header: 'Unmet',
              render: (row) => <strong>{row.unmet_count}</strong>,
            },
            { key: 'reason', header: 'Reason', render: (row) => row.reason_code },
          ]}
          rows={unmet}
          getKey={(row) => row._id}
        />
      </SectionCard>
    </div>
  );
}

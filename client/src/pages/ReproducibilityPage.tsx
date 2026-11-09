import { useEffect, useState } from 'react';
import type { PipelineRun, ReproducibilityReport } from '@yottaflex/shared';
import { apiData, apiList } from '../api';
import {
  DataTable,
  ErrorState,
  LoadingState,
  MetricCard,
  SectionCard,
  StatusBadge,
  formatNumber,
} from '../components/ui';

export function ReproducibilityPage() {
  const [report, setReport] = useState<ReproducibilityReport | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiData<ReproducibilityReport | null>('/reproducibility'),
      apiList<PipelineRun>('/runs', { pageSize: 20, sort: '_id', order: 'desc' }),
    ])
      .then(([reportResponse, runsResponse]) => {
        if (active) {
          setReport(reportResponse.data);
          setRuns(runsResponse.data);
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

  if (!report) {
    return (
      <div className="page-stack">
        <SectionCard
          title="Reproducibility evidence"
          subtitle="Run the full pipeline twice and compare deterministic exports"
        >
          <div className="explain-box">
            <strong>No report yet</strong>
            <p>
              Run <code>npm run reproduce -- --scale starter --mongo-uri mongodb://127.0.0.1:27017</code>{' '}
              to generate <code>reports/reproducibility.json</code>. The command runs the complete
              pipeline into two databases, exports both, and compares SHA-256 hashes.
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Pipeline runs" subtitle="Persisted run metadata">
          <DataTable<PipelineRun>
            columns={[
              { key: 'id', header: 'Run', render: (row) => row._id },
              { key: 'scale', header: 'Scale', render: (row) => row.scale },
              { key: 'seed', header: 'Seed', render: (row) => row.seed },
              { key: 'db', header: 'Database', render: (row) => row.db_name },
              {
                key: 'status',
                header: 'Status',
                render: (row) => <StatusBadge status={row.status} />,
              },
            ]}
            rows={runs}
            getKey={(row) => row._id}
          />
        </SectionCard>
      </div>
    );
  }

  const hashRows = Object.entries(report.run_a.hashes)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 40)
    .map(([file, hash]) => ({
      file,
      hashA: hash,
      hashB: report.run_b.hashes[file] ?? 'missing',
    }));

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Reproducibility"
          value={report.match ? 'MATCH' : 'MISMATCH'}
          hint={`${formatNumber(report.compared_files)} files compared`}
          tone={report.match ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Mismatches"
          value={formatNumber(report.mismatches.length)}
          hint={report.mismatches.length === 0 ? 'All hashes identical' : 'Review below'}
          tone={report.mismatches.length === 0 ? 'positive' : 'negative'}
        />
        <MetricCard label="Scale" value={report.scale} hint={`Seed ${report.seed}`} />
        <MetricCard label="Generated" value={report.as_of.slice(0, 10)} />
      </div>

      {report.mismatches.length > 0 ? (
        <SectionCard title="Mismatched files" subtitle="Files whose SHA-256 hashes differ">
          <ul className="mismatch-list">
            {report.mismatches.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="two-column">
        <SectionCard title="Run A" subtitle={report.run_a.db}>
          <div className="count-grid">
            {Object.entries(report.run_a.counts).map(([name, count]) => (
              <div key={name} className="count-item">
                <span>{name}</span>
                <strong>{formatNumber(count)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Run B" subtitle={report.run_b.db}>
          <div className="count-grid">
            {Object.entries(report.run_b.counts).map(([name, count]) => (
              <div key={name} className="count-item">
                <span>{name}</span>
                <strong>{formatNumber(count)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Hash comparison" subtitle="First 40 exported files">
        <DataTable
          columns={[
            { key: 'file', header: 'File', render: (row) => <span className="mono">{row.file}</span> },
            {
              key: 'a',
              header: 'Run A hash',
              render: (row) => <span className="mono hash">{row.hashA.slice(0, 16)}…</span>,
            },
            {
              key: 'b',
              header: 'Run B hash',
              render: (row) => <span className="mono hash">{row.hashB.slice(0, 16)}…</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <StatusBadge status={row.hashA === row.hashB ? 'Match' : 'Mismatch'} />
              ),
            },
          ]}
          rows={hashRows}
          getKey={(row) => row.file}
        />
      </SectionCard>

      <SectionCard title="Pipeline runs" subtitle="Persisted run metadata">
        <DataTable<PipelineRun>
          columns={[
            { key: 'id', header: 'Run', render: (row) => row._id },
            { key: 'scale', header: 'Scale', render: (row) => row.scale },
            { key: 'seed', header: 'Seed', render: (row) => row.seed },
            { key: 'db', header: 'Database', render: (row) => row.db_name },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
          rows={runs}
          getKey={(row) => row._id}
        />
      </SectionCard>
    </div>
  );
}

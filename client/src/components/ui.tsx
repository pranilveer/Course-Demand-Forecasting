import type { ReactNode } from 'react';

export function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <div className={`metric-card${tone ? ` tone-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalized = (status ?? 'unknown').toLowerCase();
  let tone = 'neutral';
  if (['pass', 'completed', 'active', 'available', 'confirmed'].includes(normalized)) {
    tone = 'positive';
  } else if (['fail', 'failed', 'inactive', 'cancelled', 'missed'].includes(normalized)) {
    tone = 'negative';
  } else if (['running', 'planned', 'proposed', 'draft', 'onleave'].includes(normalized)) {
    tone = 'warning';
  }
  return <span className={`badge badge-${tone}`}>{status ?? 'Unknown'}</span>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowClick,
  emptyMessage = 'No records found.',
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'clickable-row' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        Page {page} of {Math.max(totalPages, 1)} · {total} records
      </span>
      <div className="pagination-actions">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages || totalPages === 0}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="state-box">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-box state-error">
      <strong>Unable to load data</strong>
      <span>{message}</span>
    </div>
  );
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

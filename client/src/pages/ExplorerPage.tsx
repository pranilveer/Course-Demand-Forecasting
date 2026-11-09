import { useEffect, useMemo, useState } from 'react';
import type { CollectionName } from '@yottaflex/shared';
import { apiData, apiList, type CollectionSummary } from '../api';
import {
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SectionCard,
  formatNumber,
} from '../components/ui';

function cellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function ExplorerPage() {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selected, setSelected] = useState<CollectionName>('courses');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiData<CollectionSummary[]>('/collections')
      .then((response) => setCollections(response.data))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Unknown error'),
      );
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiList<Record<string, unknown>>(`/collections/${selected}`, {
      page,
      pageSize: 25,
      search: search || undefined,
    })
      .then((response) => {
        if (active) {
          setRows(response.data);
          setTotal(response.total);
          setTotalPages(response.totalPages);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Unknown error');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selected, page, search]);

  const columns = useMemo(() => {
    const first = rows[0];
    if (!first) {
      return [];
    }
    return Object.keys(first).map((key) => ({
      key,
      header: key,
      render: (row: Record<string, unknown>) => (
        <span className={key === '_id' ? 'mono' : undefined}>{cellValue(row[key])}</span>
      ),
      className: key === '_id' ? 'sticky-cell' : undefined,
    }));
  }, [rows]);

  return (
    <div className="page-stack">
      <SectionCard
        title="Collection explorer"
        subtitle="Browse the read-only MongoDB collections with pagination and search"
        actions={
          <div className="explorer-controls">
            <select
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value as CollectionName);
                setPage(1);
                setSearch('');
                setSearchInput('');
              }}
            >
              {collections.map((collection) => (
                <option key={collection.name} value={collection.name}>
                  {collection.name} ({formatNumber(collection.count)})
                </option>
              ))}
            </select>
            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(searchInput.trim());
              }}
            >
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search this collection"
                aria-label="Search this collection"
              />
              <button type="submit">Search</button>
            </form>
          </div>
        }
      >
        {error ? <ErrorState message={error} /> : null}
        {loading ? (
          <LoadingState label="Loading collection..." />
        ) : (
          <>
            <DataTable<Record<string, unknown>>
              columns={columns}
              rows={rows}
              getKey={(row) => String(row._id ?? JSON.stringify(row))}
              emptyMessage="No records match the current search."
            />
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPage={(next) => setPage(next)}
            />
          </>
        )}
      </SectionCard>

      <SectionCard title="Collection catalog" subtitle="Available persisted collections">
        <div className="collection-grid">
          {collections.map((collection) => (
            <button
              type="button"
              key={collection.name}
              className={`collection-card${
                collection.name === selected ? ' selected' : ''
              }`}
              onClick={() => {
                setSelected(collection.name);
                setPage(1);
                setSearch('');
                setSearchInput('');
              }}
            >
              <strong>{collection.name}</strong>
              <span>{formatNumber(collection.count)} rows</span>
              <p>{collection.description}</p>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

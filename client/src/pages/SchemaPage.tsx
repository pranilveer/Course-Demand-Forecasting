import { useEffect, useState } from 'react';
import { apiData, type SchemaResponse } from '../api';
import {
  DataTable,
  ErrorState,
  LoadingState,
  SectionCard,
  StatusBadge,
  formatNumber,
} from '../components/ui';

export function SchemaPage() {
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [selected, setSelected] = useState('courses');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiData<SchemaResponse>('/schema')
      .then((response) => {
        if (active) {
          setSchema(response.data);
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
  if (!schema) {
    return <LoadingState label="Loading schema..." />;
  }

  const collection = schema.schema[selected];

  return (
    <div className="page-stack">
      <div className="two-column">
        <SectionCard
          title="Dataset configuration"
          subtitle="Deterministic generation parameters"
        >
          <div className="config-grid">
            <div>
              <span>Seed</span>
              <strong>{schema.seed}</strong>
            </div>
            <div>
              <span>As of</span>
              <strong>{schema.as_of.slice(0, 10)}</strong>
            </div>
            <div>
              <span>Target term</span>
              <strong>{schema.target_term}</strong>
            </div>
            <div>
              <span>History terms</span>
              <strong>{schema.history_terms.join(', ')}</strong>
            </div>
          </div>
          <div className="scale-table">
            <div className="scale-row scale-head">
              <span>Scale</span>
              <span>Programs</span>
              <span>Courses</span>
              <span>Faculty</span>
              <span>Students</span>
              <span>Plans</span>
              <span>Rooms</span>
            </div>
            {Object.entries(schema.scales).map(([name, values]) => (
              <div key={name} className="scale-row">
                <strong>{name}</strong>
                <span>{formatNumber(values.programs ?? 0)}</span>
                <span>{formatNumber(values.courses ?? 0)}</span>
                <span>{formatNumber(values.faculty ?? 0)}</span>
                <span>{formatNumber(values.students ?? 0)}</span>
                <span>{formatNumber(values.studentPlans ?? 0)}</span>
                <span>{formatNumber(values.rooms ?? 0)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Business rules" subtitle="Rules enforced by the validator">
          <div className="rule-list">
            {schema.business_rules.map((rule) => (
              <div key={rule.id} className="rule-card">
                <div className="rule-head">
                  <strong>{rule.id}</strong>
                  <span>{rule.title}</span>
                </div>
                <p>{rule.description}</p>
                <div className="rule-tags">
                  {rule.enforced_by.map((check) => (
                    <span key={check} className="tag">
                      {check}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Collection schema"
        subtitle="Canonical fields, types, and constraints"
        actions={
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {schema.collections.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        }
      >
        {collection ? (
          <>
            <p className="schema-description">{collection.description}</p>
            <DataTable
              columns={[
                { key: 'name', header: 'Field', render: (row) => <span className="mono">{row.name}</span> },
                { key: 'type', header: 'Type', render: (row) => row.type },
                {
                  key: 'required',
                  header: 'Required',
                  render: (row) => (
                    <StatusBadge status={row.required ? 'Required' : 'Optional'} />
                  ),
                },
                { key: 'description', header: 'Description', render: (row) => row.description },
                {
                  key: 'values',
                  header: 'Allowed values',
                  render: (row) => (row.enum?.length ? row.enum.join(', ') : '—'),
                },
              ]}
              rows={collection.fields}
              getKey={(row) => row.name}
            />
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AllocationDecision,
  AllocationMetrics,
  Faculty,
  Room,
  Section,
  WorkloadAssignment,
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

export function AllocationPage() {
  const [metrics, setMetrics] = useState<AllocationMetrics | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<WorkloadAssignment[]>([]);
  const [decisions, setDecisions] = useState<AllocationDecision[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiData<AllocationMetrics>('/metrics/allocation'),
      apiList<Section>('/sections', { pageSize: 500, sort: '_id' }),
      apiList<WorkloadAssignment>('/assignments', { pageSize: 500, sort: '_id' }),
      apiList<AllocationDecision>('/decisions', { pageSize: 500, sort: '_id' }),
      apiList<Faculty>('/faculty', { pageSize: 100, sort: '_id' }),
      apiList<Room>('/rooms', { pageSize: 100, sort: '_id' }),
    ])
      .then(([metricsResponse, sectionResponse, assignmentResponse, decisionResponse, facultyResponse, roomResponse]) => {
        if (active) {
          setMetrics(metricsResponse.data);
          setSections(sectionResponse.data);
          setAssignments(assignmentResponse.data);
          setDecisions(decisionResponse.data);
          setFaculty(facultyResponse.data);
          setRooms(roomResponse.data);
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

  const facultyById = useMemo(
    () => new Map(faculty.map((row) => [row._id, row])),
    [faculty],
  );
  const roomById = useMemo(() => new Map(rooms.map((row) => [row._id, row])), [rooms]);
  const assignmentsBySection = useMemo(() => {
    const map = new Map<string, WorkloadAssignment[]>();
    for (const assignment of assignments) {
      const bucket = map.get(assignment.section_id) ?? [];
      bucket.push(assignment);
      map.set(assignment.section_id, bucket);
    }
    return map;
  }, [assignments]);

  const workloadRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const assignment of assignments) {
      totals.set(
        assignment.faculty_id,
        (totals.get(assignment.faculty_id) ?? 0) + assignment.workload_units,
      );
    }
    return [...totals.entries()]
      .map(([facultyId, units]) => {
        const member = facultyById.get(facultyId);
        const max = member?.max_workload_units ?? 0;
        return {
          faculty: facultyId,
          name: member?.display_name ?? facultyId,
          units,
          max,
          utilization: max > 0 ? (units / max) * 100 : 0,
        };
      })
      .sort((left, right) => right.utilization - left.utilization)
      .slice(0, 14);
  }, [assignments, facultyById]);

  const unmetRows = Object.entries(metrics?.unmet_by_reason ?? {}).map(
    ([reason, count]) => ({ reason, count }),
  );

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!metrics) {
    return <LoadingState label="Loading allocation..." />;
  }

  const selectedAssignments = selected
    ? assignmentsBySection.get(selected._id) ?? []
    : [];
  const selectedDecisions = selected
    ? decisions.filter((decision) => decision.section_id === selected._id)
    : [];

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Demand met"
          value={formatPercent(metrics.demand_met_pct)}
          hint={`${formatNumber(metrics.allocated_capacity)} of ${formatNumber(metrics.forecast_total)}`}
          tone="positive"
        />
        <MetricCard
          label="Sections"
          value={formatNumber(metrics.section_count)}
          hint={`${formatNumber(metrics.course_count)} forecast courses`}
        />
        <MetricCard
          label="Unmet students"
          value={formatNumber(metrics.unmet_total)}
          tone={metrics.unmet_total > 0 ? 'negative' : 'positive'}
        />
        <MetricCard label="Average fill rate" value={formatPercent(metrics.avg_fill_rate)} />
        <MetricCard
          label="Skill match"
          value={formatPercent(metrics.skill_match_pct)}
          hint={`${formatNumber(metrics.faculty_count)} faculty assigned`}
        />
        <MetricCard
          label="Room utilization"
          value={formatPercent(metrics.room_utilization_pct)}
          hint={`${formatNumber(metrics.room_count)} usable rooms`}
        />
      </div>

      <div className="two-column">
        <SectionCard title="Unmet demand" subtitle="Students not placed by reason">
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={unmetRows} layout="vertical" margin={{ left: 32, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="reason" width={150} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" name="Students" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard
          title="Faculty workload utilization"
          subtitle="Top assigned faculty by percentage of maximum workload"
        >
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={workloadRows} layout="vertical" margin={{ left: 44, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 120]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="faculty" width={80} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number) => `${formatNumber(value, 1)}%`}
                  labelFormatter={(label) => {
                    const row = workloadRows.find((item) => item.faculty === label);
                    return row ? `${row.name} (${row.units}/${row.max} units)` : String(label);
                  }}
                />
                <Bar dataKey="utilization" name="Utilization" fill="#0f766e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Allocated sections"
        subtitle="Select a row to inspect the decision trail"
      >
        <DataTable<Section>
          columns={[
            { key: 'id', header: 'Section', render: (row) => row._id },
            { key: 'course', header: 'Course', render: (row) => row.course_id },
            { key: 'no', header: 'No.', render: (row) => row.section_no },
            {
              key: 'slot',
              header: 'Schedule',
              render: (row) => `${row.schedule_day} ${row.start_time}-${row.end_time}`,
            },
            {
              key: 'room',
              header: 'Room',
              render: (row) => {
                const room = row.room_id ? roomById.get(row.room_id) : null;
                return room ? `${room.building} ${room.room_number}` : row.room_id ?? 'Unassigned';
              },
            },
            {
              key: 'faculty',
              header: 'Faculty',
              render: (row) => {
                const assigned = assignmentsBySection.get(row._id) ?? [];
                return assigned
                  .map((item) => facultyById.get(item.faculty_id)?.display_name ?? item.faculty_id)
                  .join(', ') || 'Unassigned';
              },
            },
            {
              key: 'fill',
              header: 'Enrollment',
              render: (row) => `${row.enrolled_count}/${row.capacity}`,
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
          rows={sections}
          getKey={(row) => row._id}
          onRowClick={(row) => setSelected(row)}
        />
      </SectionCard>

      {selected ? (
        <div className="drawer-backdrop" onClick={() => setSelected(null)} role="presentation">
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <header className="drawer-header">
              <div>
                <p className="eyebrow">Decision trail</p>
                <h2>{selected._id}</h2>
                <p>
                  {selected.course_id} · {selected.schedule_day} {selected.start_time}-
                  {selected.end_time}
                </p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelected(null)}>
                Close
              </button>
            </header>

            <div className="drawer-section">
              <h3>Assignments</h3>
              {selectedAssignments.length === 0 ? (
                <p className="empty-state">No workload assignments.</p>
              ) : (
                selectedAssignments.map((assignment) => {
                  const member = facultyById.get(assignment.faculty_id);
                  return (
                    <div key={assignment._id} className="detail-row">
                      <div>
                        <strong>{member?.display_name ?? assignment.faculty_id}</strong>
                        <span>
                          {assignment.assignment_role} · {assignment.workload_units} units
                        </span>
                      </div>
                      <StatusBadge status={assignment.status} />
                    </div>
                  );
                })
              )}
            </div>

            <div className="drawer-section">
              <h3>Allocation decisions</h3>
              {selectedDecisions.length === 0 ? (
                <p className="empty-state">No decisions recorded for this section.</p>
              ) : (
                selectedDecisions.map((decision) => (
                  <div key={decision._id} className="decision-card">
                    <div className="decision-head">
                      <strong>{decision.decision_type}</strong>
                      <span>Score {formatNumber(decision.score, 2)}</span>
                    </div>
                    <p>{decision.rationale}</p>
                    {decision.candidate_snapshot?.top_candidates?.length ? (
                      <div className="candidate-list">
                        {decision.candidate_snapshot.top_candidates.slice(0, 5).map((candidate) => (
                          <div key={candidate.faculty_id} className="candidate-row">
                            <span>{candidate.faculty_id}</span>
                            <span>{formatNumber(candidate.score, 2)}</span>
                            <span>{candidate.proficiency}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

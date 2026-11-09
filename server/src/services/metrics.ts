import {
  DAYS_OF_WEEK,
  TARGET_TERM,
  TIME_SLOTS,
  type AllocationDecision,
  type AllocationMetrics,
  type DemandForecast,
  type Faculty,
  type FacultySkill,
  type Room,
  type Section,
  type UnmetDemand,
  type WorkloadAssignment,
} from '@yottaflex/shared';

export interface AllocationMetricInput {
  forecasts: readonly DemandForecast[];
  sections: readonly Section[];
  workloadAssignments: readonly WorkloadAssignment[];
  allocationDecisions: readonly AllocationDecision[];
  unmetDemands: readonly UnmetDemand[];
  faculty: readonly Faculty[];
  facultySkills: readonly FacultySkill[];
  rooms: readonly Room[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? round2((numerator / denominator) * 100) : 0;
}

export function computeAllocationMetrics(
  input: AllocationMetricInput,
  asOf: string,
): AllocationMetrics {
  const asOfDate = asOf.slice(0, 10);
  const forecasts = input.forecasts.filter((row) => row.term === TARGET_TERM);
  const sections = input.sections.filter((row) => row.term === TARGET_TERM);
  const assignments = input.workloadAssignments.filter(
    (row) => row.term === TARGET_TERM && row.status !== 'Cancelled',
  );
  const decisions = input.allocationDecisions.filter(
    (row) => row.term === TARGET_TERM,
  );
  const unmet = input.unmetDemands.filter((row) => row.term === TARGET_TERM);

  const forecastTotal = forecasts.reduce(
    (sum, row) => sum + row.forecast_enrollment,
    0,
  );
  const unmetTotal = unmet.reduce((sum, row) => sum + row.unmet_count, 0);
  const allocatedCapacity = Math.max(0, forecastTotal - unmetTotal);

  const unmetByReason: Record<string, number> = {};
  for (const row of unmet) {
    unmetByReason[row.reason_code] =
      (unmetByReason[row.reason_code] ?? 0) + row.unmet_count;
  }

  const fillRates = sections
    .filter((section) => section.capacity > 0)
    .map((section) => (section.enrolled_count / section.capacity) * 100);

  const workloadByFaculty = new Map<string, number>();
  for (const assignment of assignments) {
    workloadByFaculty.set(
      assignment.faculty_id,
      (workloadByFaculty.get(assignment.faculty_id) ?? 0) +
        assignment.workload_units,
    );
  }

  const facultyById = new Map(input.faculty.map((row) => [row._id, row]));
  const utilization = [...workloadByFaculty.entries()]
    .map(([facultyId, units]) => {
      const member = facultyById.get(facultyId);
      if (!member || member.max_workload_units <= 0) {
        return 0;
      }
      return (units / member.max_workload_units) * 100;
    })
    .filter((value) => Number.isFinite(value));

  const validSkillKeys = new Set(
    input.facultySkills
      .filter(
        (skill) =>
          skill.certified_date <= asOfDate &&
          (skill.expires_date === null || skill.expires_date >= asOfDate),
      )
      .map((skill) => `${skill.faculty_id}:${skill.course_id}`),
  );
  const sectionById = new Map(sections.map((row) => [row._id, row]));
  const skillMatchedAssignments = assignments.filter((assignment) => {
    const section = sectionById.get(assignment.section_id);
    if (!section) {
      return false;
    }
    return validSkillKeys.has(`${assignment.faculty_id}:${section.course_id}`);
  }).length;

  const usableRooms = input.rooms.filter((room) => room.status === 'Available');
  const scheduledRoomSlots = new Set(
    sections
      .filter((section) => section.room_id !== null)
      .map((section) => `${section.room_id}:${section.schedule_day}:${section.start_time}`),
  );
  const weeklyRoomSlots = usableRooms.length * DAYS_OF_WEEK.length * TIME_SLOTS.length;

  const explainableDecisions = decisions.filter(
    (decision) =>
      decision.rationale.trim().length > 0 &&
      decision.candidate_snapshot !== null &&
      decision.candidate_snapshot !== undefined,
  ).length;

  return {
    term: TARGET_TERM,
    course_count: forecasts.length,
    forecast_total: forecastTotal,
    allocated_capacity: allocatedCapacity,
    demand_met_pct: percentage(allocatedCapacity, forecastTotal),
    unmet_total: unmetTotal,
    unmet_by_reason: unmetByReason,
    section_count: sections.length,
    avg_fill_rate: round2(average(fillRates)),
    faculty_count: workloadByFaculty.size,
    avg_workload_utilization: round2(average(utilization)),
    skill_match_pct: percentage(skillMatchedAssignments, assignments.length),
    room_count: usableRooms.length,
    room_utilization_pct: percentage(scheduledRoomSlots.size, weeklyRoomSlots),
    decision_count: decisions.length,
    explainability_pct: percentage(explainableDecisions, decisions.length),
    generated_at: asOf,
  };
}

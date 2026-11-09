import {
  DAYS_OF_WEEK,
  ID_PREFIXES,
  ISSUE_RULE_MAP,
  MAX_SECTIONS_PER_COURSE,
  MIN_SECTION_SIZE,
  PLAN_TERMS,
  TERM_CODES,
  TERM_DATES,
  TARGET_TERM,
  TIME_SLOTS,
  makeId,
  makeTermId,
  type AllocationDecision,
  type Availability,
  type CandidateSnapshot,
  type Course,
  type CourseType,
  type DayOfWeek,
  type DemandForecast,
  type Faculty,
  type FacultyCandidate,
  type FacultySkill,
  type GroundTruthAnomaly,
  type IssueType,
  type LifecycleEvent,
  type Prerequisite,
  type Room,
  type RoomType,
  type Section,
  type Student,
  type StudentPlan,
  type WorkloadAssignment,
} from '@yottaflex/shared';
import { insertBatched } from '../db.js';
import { dateTime } from '../lib/time.js';
import {
  AllocationDecisionModel,
  GroundTruthAnomalyModel,
  LifecycleEventModel,
  SectionModel,
  StudentPlanModel,
  WorkloadAssignmentModel,
} from '../models/index.js';

const TARGET_YEAR = TARGET_TERM.slice(0, 4);
const TERM_DATES_TARGET = TERM_DATES[TARGET_TERM];
const AS_OF_DATE = '2026-08-01';

const ROOM_COMPATIBILITY: Record<CourseType, readonly RoomType[]> = {
  Core: ['Lecture', 'Seminar'],
  Elective: ['Lecture', 'Seminar'],
  Lab: ['Lab', 'ComputerLab'],
  Seminar: ['Seminar', 'Lecture'],
};

interface Slot {
  day: DayOfWeek;
  start: string;
  end: string;
  index: number;
}

const SLOTS: Slot[] = DAYS_OF_WEEK.flatMap((day, dayIndex) =>
  TIME_SLOTS.map((slot, slotIndex) => ({
    day,
    start: slot.start,
    end: slot.end,
    index: dayIndex * TIME_SLOTS.length + slotIndex,
  })),
);

export interface InjectionInput {
  courses: readonly Course[];
  forecasts: readonly DemandForecast[];
  faculty: readonly Faculty[];
  facultySkills: readonly FacultySkill[];
  availabilities: readonly Availability[];
  rooms: readonly Room[];
  sections: readonly Section[];
  workloadAssignments: readonly WorkloadAssignment[];
  allocationDecisions: readonly AllocationDecision[];
  students: readonly Student[];
  studentPlans: readonly StudentPlan[];
  prerequisites: readonly Prerequisite[];
  lifecycleEvents: readonly LifecycleEvent[];
  asOf: string;
  seed: number;
  anomalyPerType: number;
}

export interface InjectionResult {
  sections: Section[];
  workloadAssignments: WorkloadAssignment[];
  studentPlans: StudentPlan[];
  allocationDecisions: AllocationDecision[];
  lifecycleEvents: LifecycleEvent[];
  anomalies: GroundTruthAnomaly[];
}

interface Counters {
  section: number;
  workload: number;
  decision: number;
  event: number;
  studentPlan: number;
  anomaly: number;
}

interface InjectionState {
  allSections: Section[];
  allWorkloads: WorkloadAssignment[];
  allStudentPlans: StudentPlan[];
  allDecisions: AllocationDecision[];
  allEvents: LifecycleEvent[];
  newSections: Section[];
  newWorkloads: WorkloadAssignment[];
  newStudentPlans: StudentPlan[];
  newDecisions: AllocationDecision[];
  newEvents: LifecycleEvent[];
  anomalies: GroundTruthAnomaly[];
  courseById: Map<string, Course>;
  facultyById: Map<string, Faculty>;
  roomById: Map<string, Room>;
  sectionById: Map<string, Section>;
  sectionWorkloads: Map<string, WorkloadAssignment[]>;
  facultySlots: Set<string>;
  roomSlots: Set<string>;
  sectionKeys: Set<string>;
  studentPlanKeys: Set<string>;
  studentCoursePlans: Map<string, Map<string, StudentPlan[]>>;
  facultyWorkload: Map<string, number>;
  counters: Counters;
}

interface FacultySlotCandidate {
  faculty: Faculty;
  skill: FacultySkill | null;
  remaining: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function termIndex(term: string): number {
  return (TERM_CODES as readonly string[]).indexOf(term);
}

function idCounter(ids: readonly string[]): number {
  let max = 0;
  for (const id of ids) {
    const suffix = Number.parseInt(id.split('-').at(-1) ?? '0', 10);
    if (Number.isFinite(suffix) && suffix > max) {
      max = suffix;
    }
  }
  return max;
}

function slotKey(day: string, start: string): string {
  return `${day}:${start}`;
}

function facultySlotKey(facultyId: string, day: string, start: string): string {
  return `${facultyId}:${slotKey(day, start)}`;
}

function roomSlotKey(roomId: string, day: string, start: string): string {
  return `${roomId}:${slotKey(day, start)}`;
}

function sectionBusinessKey(courseId: string, term: string, sectionNo: number): string {
  return `${courseId}:${term}:${sectionNo}`;
}

function studentPlanKey(studentId: string, courseId: string, term: string): string {
  return `${studentId}:${courseId}:${term}`;
}

function isValidSkill(skill: FacultySkill, asOfDate: string): boolean {
  return (
    skill.certified_date <= asOfDate &&
    (skill.expires_date === null || skill.expires_date >= asOfDate)
  );
}

function buildSkillIndex(
  skills: readonly FacultySkill[],
  asOfDate: string,
): Map<string, FacultySkill> {
  const index = new Map<string, FacultySkill>();
  for (const skill of skills) {
    if (!isValidSkill(skill, asOfDate)) {
      continue;
    }
    index.set(`${skill.faculty_id}:${skill.course_id}`, skill);
  }
  return index;
}

function buildAvailabilityIndex(availabilities: readonly Availability[]): Set<string> {
  const index = new Set<string>();
  for (const availability of availabilities) {
    if (
      availability.term !== TARGET_TERM ||
      availability.availability_type !== 'Available'
    ) {
      continue;
    }
    for (const slot of TIME_SLOTS) {
      if (availability.start_time <= slot.start && availability.end_time >= slot.end) {
        index.add(
          `${availability.faculty_id}:${slotKey(availability.day_of_week, slot.start)}`,
        );
      }
    }
  }
  return index;
}

function isRoomUsable(room: Room): boolean {
  return (
    room.status === 'Available' &&
    room.effective_start_date <= TERM_DATES_TARGET.start &&
    (room.effective_end_date === null ||
      room.effective_end_date >= TERM_DATES_TARGET.end)
  );
}

function usableRoomsFor(
  rooms: readonly Room[],
  courseType: CourseType,
  capacity: number,
): Room[] {
  return rooms
    .filter(
      (room) =>
        isRoomUsable(room) &&
        ROOM_COMPATIBILITY[courseType].includes(room.room_type) &&
        room.capacity >= capacity,
    )
    .sort(
      (left, right) =>
        left.capacity - right.capacity || left._id.localeCompare(right._id),
    );
}

function sortById<T extends { _id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left._id.localeCompare(right._id));
}

function createState(input: InjectionInput): InjectionState {
  const allSections = [...input.sections];
  const allWorkloads = [...input.workloadAssignments];
  const allStudentPlans = [...input.studentPlans];
  const allDecisions = [...input.allocationDecisions];
  const allEvents = [...input.lifecycleEvents];

  const sectionById = new Map(allSections.map((section) => [section._id, section]));
  const sectionWorkloads = new Map<string, WorkloadAssignment[]>();
  const facultySlots = new Set<string>();
  const facultyWorkload = new Map<string, number>();

  for (const workload of allWorkloads) {
    const bucket = sectionWorkloads.get(workload.section_id) ?? [];
    bucket.push(workload);
    sectionWorkloads.set(workload.section_id, bucket);

    facultyWorkload.set(
      workload.faculty_id,
      (facultyWorkload.get(workload.faculty_id) ?? 0) + workload.workload_units,
    );

    const section = sectionById.get(workload.section_id);
    if (section) {
      facultySlots.add(
        facultySlotKey(workload.faculty_id, section.schedule_day, section.start_time),
      );
    }
  }

  const roomSlots = new Set<string>();
  for (const section of allSections) {
    if (section.room_id) {
      roomSlots.add(
        roomSlotKey(section.room_id, section.schedule_day, section.start_time),
      );
    }
  }

  const studentCoursePlans = new Map<string, Map<string, StudentPlan[]>>();
  for (const plan of allStudentPlans) {
    const byCourse = studentCoursePlans.get(plan.student_id) ?? new Map();
    const bucket = byCourse.get(plan.course_id) ?? [];
    bucket.push(plan);
    byCourse.set(plan.course_id, bucket);
    studentCoursePlans.set(plan.student_id, byCourse);
  }

  return {
    allSections,
    allWorkloads,
    allStudentPlans,
    allDecisions,
    allEvents,
    newSections: [],
    newWorkloads: [],
    newStudentPlans: [],
    newDecisions: [],
    newEvents: [],
    anomalies: [],
    courseById: new Map(input.courses.map((course) => [course._id, course])),
    facultyById: new Map(input.faculty.map((member) => [member._id, member])),
    roomById: new Map(input.rooms.map((room) => [room._id, room])),
    sectionById,
    sectionWorkloads,
    facultySlots,
    roomSlots,
    sectionKeys: new Set(
      allSections.map((section) =>
        sectionBusinessKey(section.course_id, section.term, section.section_no),
      ),
    ),
    studentPlanKeys: new Set(
      allStudentPlans.map((plan) =>
        studentPlanKey(plan.student_id, plan.course_id, plan.term),
      ),
    ),
    studentCoursePlans,
    facultyWorkload,
    counters: {
      section: idCounter(allSections.map((section) => section._id)),
      workload: idCounter(allWorkloads.map((workload) => workload._id)),
      decision: idCounter(allDecisions.map((decision) => decision._id)),
      event: idCounter(allEvents.map((event) => event._id)),
      studentPlan: idCounter(allStudentPlans.map((plan) => plan._id)),
      anomaly: 0,
    },
  };
}

function remainingWorkload(state: InjectionState, faculty: Faculty): number {
  return faculty.max_workload_units - (state.facultyWorkload.get(faculty._id) ?? 0);
}

function addSection(state: InjectionState, section: Section): void {
  state.allSections.push(section);
  state.newSections.push(section);
  state.sectionById.set(section._id, section);
  state.sectionKeys.add(
    sectionBusinessKey(section.course_id, section.term, section.section_no),
  );
  if (section.room_id) {
    state.roomSlots.add(
      roomSlotKey(section.room_id, section.schedule_day, section.start_time),
    );
  }
}

function addWorkload(
  state: InjectionState,
  workload: WorkloadAssignment,
  section: Section,
): void {
  state.allWorkloads.push(workload);
  state.newWorkloads.push(workload);
  const bucket = state.sectionWorkloads.get(workload.section_id) ?? [];
  bucket.push(workload);
  state.sectionWorkloads.set(workload.section_id, bucket);
  state.facultySlots.add(
    facultySlotKey(workload.faculty_id, section.schedule_day, section.start_time),
  );
  state.facultyWorkload.set(
    workload.faculty_id,
    (state.facultyWorkload.get(workload.faculty_id) ?? 0) + workload.workload_units,
  );
}

function addStudentPlan(state: InjectionState, plan: StudentPlan): void {
  state.allStudentPlans.push(plan);
  state.newStudentPlans.push(plan);
  state.studentPlanKeys.add(studentPlanKey(plan.student_id, plan.course_id, plan.term));
  const byCourse = state.studentCoursePlans.get(plan.student_id) ?? new Map();
  const bucket = byCourse.get(plan.course_id) ?? [];
  bucket.push(plan);
  byCourse.set(plan.course_id, bucket);
  state.studentCoursePlans.set(plan.student_id, byCourse);
}

function addDecision(state: InjectionState, decision: AllocationDecision): void {
  state.allDecisions.push(decision);
  state.newDecisions.push(decision);
}

function addEvent(state: InjectionState, event: LifecycleEvent): void {
  state.allEvents.push(event);
  state.newEvents.push(event);
}

function addAnomaly(state: InjectionState, anomaly: GroundTruthAnomaly): void {
  state.anomalies.push(anomaly);
}

function nextSectionId(state: InjectionState): string {
  state.counters.section += 1;
  return makeTermId(ID_PREFIXES.section, TARGET_YEAR, state.counters.section);
}

function nextWorkloadId(state: InjectionState): string {
  state.counters.workload += 1;
  return makeTermId(ID_PREFIXES.workloadAssignment, TARGET_YEAR, state.counters.workload);
}

function nextDecisionId(state: InjectionState): string {
  state.counters.decision += 1;
  return makeTermId(ID_PREFIXES.allocationDecision, TARGET_YEAR, state.counters.decision);
}

function nextEventId(state: InjectionState): string {
  state.counters.event += 1;
  return makeId(ID_PREFIXES.lifecycleEvent, state.counters.event);
}

function nextStudentPlanId(state: InjectionState): string {
  state.counters.studentPlan += 1;
  return makeId(ID_PREFIXES.studentPlan, state.counters.studentPlan);
}

function nextAnomalyId(state: InjectionState): string {
  state.counters.anomaly += 1;
  return makeId(ID_PREFIXES.anomaly, state.counters.anomaly);
}

function makeEvent(
  state: InjectionState,
  entityType: 'Section' | 'WorkloadAssignment' | 'StudentPlan',
  entityId: string,
  fromState: string | null,
  toState: string,
  eventType: 'Created' | 'StatusChanged' | 'Assigned',
  eventTs: string,
  reason: string,
): LifecycleEvent {
  return {
    _id: nextEventId(state),
    entity_type: entityType,
    entity_id: entityId,
    from_state: fromState,
    to_state: toState,
    event_type: eventType,
    event_ts: eventTs,
    actor: 'Administrator',
    reason,
    created_at: AS_OF_DATE + 'T00:00:00.000Z',
  };
}

function makeCandidate(
  faculty: Faculty,
  skill: FacultySkill,
  remaining: number,
): FacultyCandidate {
  return {
    faculty_id: faculty._id,
    score: 50,
    proficiency: skill.proficiency,
    remaining_workload: remaining,
    department_match: false,
    reasons: ['Injected anomaly fixture'],
  };
}

function makeSnapshot(
  slot: Slot,
  room: Room,
  faculty: Faculty,
  skill: FacultySkill,
  remaining: number,
  notes: string,
): CandidateSnapshot {
  return {
    slot: { day: slot.day, start_time: slot.start, end_time: slot.end },
    chosen_room_id: room._id,
    chosen_faculty_id: faculty._id,
    room_capacity: room.capacity,
    top_candidates: [makeCandidate(faculty, skill, remaining)],
    notes,
  };
}

function makeAnomaly(
  state: InjectionState,
  issueType: IssueType,
  entityType: GroundTruthAnomaly['entity_type'],
  entityId: string,
  relatedEntityId: string | null,
  expectedAction: string,
  severity: GroundTruthAnomaly['severity'],
  notes: string,
): GroundTruthAnomaly {
  return {
    _id: nextAnomalyId(state),
    issue_type: issueType,
    entity_type: entityType,
    entity_id: entityId,
    related_entity_id: relatedEntityId,
    expected_rule: ISSUE_RULE_MAP[issueType],
    expected_action: expectedAction,
    severity,
    injected: true,
    notes,
    created_at: AS_OF_DATE + 'T00:00:00.000Z',
  };
}

export function buildInjection(input: InjectionInput): InjectionResult {
  if (input.anomalyPerType < 1) {
    throw new Error('anomalyPerType must be at least 1');
  }

  const state = createState(input);
  const availableSlots = buildAvailabilityIndex(input.availabilities);
  const skillIndex = buildSkillIndex(input.facultySkills, AS_OF_DATE);
  const facultySorted = sortById(input.faculty);
  const sectionSorted = sortById(input.sections);
  const forecastByCourse = new Map(
    input.forecasts
      .filter((forecast) => forecast.term === TARGET_TERM)
      .map((forecast) => [forecast.course_id, forecast]),
  );

  const usedOutsideSkill = new Set<string>();
  const usedWorkloadFaculty = new Set<string>();
  const usedCapacityCourses = new Set<string>();
  const usedPrerequisiteStudents = new Set<string>();
  const usedDuplicateKeys = new Set<string>();

  function facultyFor(
    course: Course,
    slot: Slot,
    requireSkill: boolean,
    minimumUnits: number,
  ): FacultySlotCandidate | null {
    for (const faculty of facultySorted) {
      if (faculty.status !== 'Active') {
        continue;
      }
      const skill = skillIndex.get(`${faculty._id}:${course._id}`) ?? null;
      if (requireSkill && !skill) {
        continue;
      }
      if (!requireSkill && skill) {
        continue;
      }
      if (!availableSlots.has(facultySlotKey(faculty._id, slot.day, slot.start))) {
        continue;
      }
      if (state.facultySlots.has(facultySlotKey(faculty._id, slot.day, slot.start))) {
        continue;
      }
      const remaining = remainingWorkload(state, faculty);
      if (remaining < minimumUnits) {
        continue;
      }
      return { faculty, skill, remaining };
    }
    return null;
  }

  function roomSlotFor(
    course: Course,
    capacity: number,
    exclude?: Slot,
  ): { room: Room; slot: Slot } | null {
    const rooms = usableRoomsFor(input.rooms, course.course_type, capacity);
    for (const slot of SLOTS) {
      if (
        exclude &&
        slot.day === exclude.day &&
        slot.start === exclude.start
      ) {
        continue;
      }
      for (const room of rooms) {
        if (state.roomSlots.has(roomSlotKey(room._id, slot.day, slot.start))) {
          continue;
        }
        return { room, slot };
      }
    }
    return null;
  }

  function injectOutsideSkill(): void {
    for (const section of sectionSorted) {
      const course = state.courseById.get(section.course_id);
      if (!course || course.status !== 'Active') {
        continue;
      }
      const slot = SLOTS.find(
        (candidate) =>
          candidate.day === section.schedule_day &&
          candidate.start === section.start_time,
      );
      if (!slot) {
        continue;
      }
      const candidate = facultyFor(course, slot, false, 1);
      if (!candidate) {
        continue;
      }
      const key = `${section._id}:${candidate.faculty._id}`;
      if (usedOutsideSkill.has(key)) {
        continue;
      }
      const units = Math.min(course.contact_hours, candidate.remaining);
      if (units < 1) {
        continue;
      }
      const workloadId = nextWorkloadId(state);
      const workload: WorkloadAssignment = {
        _id: workloadId,
        faculty_id: candidate.faculty._id,
        section_id: section._id,
        term: TARGET_TERM,
        workload_units: units,
        assignment_role: 'CoInstructor',
        assigned_date: AS_OF_DATE,
        status: 'Proposed',
        created_at: input.asOf,
      };
      addWorkload(state, workload, section);
      addEvent(
        state,
        makeEvent(
          state,
          'WorkloadAssignment',
          workloadId,
          null,
          'Proposed',
          'Assigned',
          dateTime(AS_OF_DATE, '11:00:00'),
          'Injected anomaly: FACULTY_OUTSIDE_SKILL',
        ),
      );
      addAnomaly(
        state,
        makeAnomaly(
          state,
          'FACULTY_OUTSIDE_SKILL',
          'WorkloadAssignment',
          workloadId,
          section._id,
          'Reassign to a qualified faculty member',
          'High',
          `Added co-instructor ${candidate.faculty._id} without a valid skill for ${course._id}.`,
        ),
      );
      usedOutsideSkill.add(key);
      return;
    }
    throw new Error('Unable to inject FACULTY_OUTSIDE_SKILL anomaly');
  }

  function injectWorkloadExceeded(): void {
    for (const section of sectionSorted) {
      const course = state.courseById.get(section.course_id);
      if (!course || course.status !== 'Active') {
        continue;
      }
      const slot = SLOTS.find(
        (candidate) =>
          candidate.day === section.schedule_day &&
          candidate.start === section.start_time,
      );
      if (!slot) {
        continue;
      }
      const existingFaculty = new Set(
        (state.sectionWorkloads.get(section._id) ?? []).map(
          (workload) => workload.faculty_id,
        ),
      );
      for (const faculty of facultySorted) {
        if (usedWorkloadFaculty.has(faculty._id) || existingFaculty.has(faculty._id)) {
          continue;
        }
        if (faculty.status !== 'Active') {
          continue;
        }
        if (!skillIndex.has(`${faculty._id}:${course._id}`)) {
          continue;
        }
        if (!availableSlots.has(facultySlotKey(faculty._id, slot.day, slot.start))) {
          continue;
        }
        if (state.facultySlots.has(facultySlotKey(faculty._id, slot.day, slot.start))) {
          continue;
        }
        const remaining = remainingWorkload(state, faculty);
        if (remaining < 0) {
          continue;
        }
        const units = remaining + 1;
        const workloadId = nextWorkloadId(state);
        const workload: WorkloadAssignment = {
          _id: workloadId,
          faculty_id: faculty._id,
          section_id: section._id,
          term: TARGET_TERM,
          workload_units: units,
          assignment_role: 'CoInstructor',
          assigned_date: AS_OF_DATE,
          status: 'Proposed',
          created_at: input.asOf,
        };
        addWorkload(state, workload, section);
        addEvent(
          state,
          makeEvent(
            state,
            'WorkloadAssignment',
            workloadId,
            null,
            'Proposed',
            'Assigned',
            dateTime(AS_OF_DATE, '11:05:00'),
            'Injected anomaly: WORKLOAD_EXCEEDED',
          ),
        );
        addAnomaly(
          state,
          makeAnomaly(
            state,
            'WORKLOAD_EXCEEDED',
            'WorkloadAssignment',
            workloadId,
            section._id,
            'Reassign units or raise the approved workload limit',
            'High',
            `Added ${units} units to ${faculty._id}, exceeding max ${faculty.max_workload_units}.`,
          ),
        );
        usedWorkloadFaculty.add(faculty._id);
        return;
      }
    }
    throw new Error('Unable to inject WORKLOAD_EXCEEDED anomaly');
  }

  function injectCapacityTooLow(): void {
    const courses = [...input.courses]
      .filter(
        (course) =>
          course.status === 'Active' &&
          (forecastByCourse.get(course._id)?.forecast_enrollment ?? 0) > 0,
      )
      .sort((left, right) => {
        const leftForecast =
          forecastByCourse.get(left._id)?.forecast_enrollment ?? 0;
        const rightForecast =
          forecastByCourse.get(right._id)?.forecast_enrollment ?? 0;
        if (leftForecast !== rightForecast) {
          return rightForecast - leftForecast;
        }
        return left._id.localeCompare(right._id);
      });

    const sectionCounts = new Map<string, number>();
    for (const section of state.allSections) {
      sectionCounts.set(
        section.course_id,
        (sectionCounts.get(section.course_id) ?? 0) + 1,
      );
    }

    for (const course of courses) {
      if (usedCapacityCourses.has(course._id)) {
        continue;
      }
      if ((sectionCounts.get(course._id) ?? 0) >= MAX_SECTIONS_PER_COURSE) {
        continue;
      }
      const maxSectionNo = state.allSections
        .filter((section) => section.course_id === course._id)
        .reduce((max, section) => Math.max(max, section.section_no), 0);
      const sectionNo = maxSectionNo + 1;
      if (
        state.sectionKeys.has(
          sectionBusinessKey(course._id, TARGET_TERM, sectionNo),
        )
      ) {
        continue;
      }
      const capacity = MIN_SECTION_SIZE - 1;
      for (const slot of SLOTS) {
        const rooms = usableRoomsFor(input.rooms, course.course_type, capacity);
        for (const room of rooms) {
          if (state.roomSlots.has(roomSlotKey(room._id, slot.day, slot.start))) {
            continue;
          }
          const candidate = facultyFor(course, slot, true, course.contact_hours);
          if (!candidate || !candidate.skill) {
            continue;
          }
          const sectionId = nextSectionId(state);
          const section: Section = {
            _id: sectionId,
            course_id: course._id,
            term: TARGET_TERM,
            section_no: sectionNo,
            room_id: room._id,
            capacity,
            enrolled_count: 0,
            schedule_day: slot.day,
            start_time: slot.start,
            end_time: slot.end,
            delivery_mode: 'InPerson',
            status: 'Proposed',
            created_at: input.asOf,
          };
          addSection(state, section);

          const workloadId = nextWorkloadId(state);
          const workload: WorkloadAssignment = {
            _id: workloadId,
            faculty_id: candidate.faculty._id,
            section_id: sectionId,
            term: TARGET_TERM,
            workload_units: course.contact_hours,
            assignment_role: 'Instructor',
            assigned_date: AS_OF_DATE,
            status: 'Proposed',
            created_at: input.asOf,
          };
          addWorkload(state, workload, section);

          const snapshot = makeSnapshot(
            slot,
            room,
            candidate.faculty,
            candidate.skill,
            candidate.remaining,
            `Injected undersized section ${sectionNo} for ${course._id}.`,
          );
          const decisionId = nextDecisionId(state);
          addDecision(state, {
            _id: decisionId,
            section_id: sectionId,
            course_id: course._id,
            faculty_id: candidate.faculty._id,
            room_id: room._id,
            term: TARGET_TERM,
            decision_type: 'SectionProposal',
            score: 50,
            candidate_snapshot: snapshot,
            rationale: `Injected anomaly fixture for ${course._id}; capacity ${capacity} is below minimum ${MIN_SECTION_SIZE}.`,
            created_at: input.asOf,
          });

          addEvent(
            state,
            makeEvent(
              state,
              'Section',
              sectionId,
              null,
              'Draft',
              'Created',
              dateTime(AS_OF_DATE, '11:10:00'),
              'Injected anomaly: SECTION_CAPACITY_TOO_LOW',
            ),
          );
          addEvent(
            state,
            makeEvent(
              state,
              'Section',
              sectionId,
              'Draft',
              'Proposed',
              'StatusChanged',
              dateTime(AS_OF_DATE, '11:11:00'),
              'Injected anomaly: SECTION_CAPACITY_TOO_LOW',
            ),
          );
          addEvent(
            state,
            makeEvent(
              state,
              'WorkloadAssignment',
              workloadId,
              null,
              'Proposed',
              'Assigned',
              dateTime(AS_OF_DATE, '11:12:00'),
              'Injected anomaly: SECTION_CAPACITY_TOO_LOW',
            ),
          );
          addAnomaly(
            state,
            makeAnomaly(
              state,
              'SECTION_CAPACITY_TOO_LOW',
              'Section',
              sectionId,
              course._id,
              'Increase capacity or merge with another section',
              'High',
              `Added section ${sectionId} with capacity ${capacity} below minimum ${MIN_SECTION_SIZE}.`,
            ),
          );
          usedCapacityCourses.add(course._id);
          return;
        }
      }
    }
    throw new Error('Unable to inject SECTION_CAPACITY_TOO_LOW anomaly');
  }

  function injectPrerequisite(): void {
    const strictByCourse = new Map<string, string[]>();
    const reverse = new Map<string, string[]>();
    for (const prerequisite of input.prerequisites) {
      if (!prerequisite.is_strict) {
        continue;
      }
      const bucket = strictByCourse.get(prerequisite.course_id) ?? [];
      bucket.push(prerequisite.prerequisite_course_id);
      strictByCourse.set(prerequisite.course_id, bucket);

      const reverseBucket = reverse.get(prerequisite.prerequisite_course_id) ?? [];
      reverseBucket.push(prerequisite.course_id);
      reverse.set(prerequisite.prerequisite_course_id, reverseBucket);
    }
    for (const bucket of reverse.values()) {
      bucket.sort();
    }

    const students = sortById(input.students);
    for (const student of students) {
      if (usedPrerequisiteStudents.has(student._id)) {
        continue;
      }
      const byCourse = state.studentCoursePlans.get(student._id);
      if (!byCourse) {
        continue;
      }
      const plans = [...byCourse.values()]
        .flat()
        .sort(
          (left, right) =>
            termIndex(left.term) - termIndex(right.term) ||
            left._id.localeCompare(right._id),
        );
      const entryIndex = termIndex(student.entry_term);

      for (const prerequisitePlan of plans) {
        if (prerequisitePlan.status === 'Dropped') {
          continue;
        }
        const prerequisiteIndex = termIndex(prerequisitePlan.term);
        if (prerequisiteIndex <= 0) {
          continue;
        }
        const dependentCourses = reverse.get(prerequisitePlan.course_id) ?? [];
        for (const dependentCourseId of dependentCourses) {
          const dependentCourse = state.courseById.get(dependentCourseId);
          if (!dependentCourse || dependentCourse.status !== 'Active') {
            continue;
          }
          if (byCourse.has(dependentCourseId)) {
            continue;
          }
          const earlierTerms = PLAN_TERMS.filter(
            (term) =>
              termIndex(term) < prerequisiteIndex && termIndex(term) >= entryIndex,
          );
          if (earlierTerms.length === 0) {
            continue;
          }
          const targetTerm = earlierTerms[earlierTerms.length - 1]!;
          const targetIndex = termIndex(targetTerm);

          const otherPrerequisites = (
            strictByCourse.get(dependentCourseId) ?? []
          ).filter((courseId) => courseId !== prerequisitePlan.course_id);
          const satisfied = otherPrerequisites.every((courseId) => {
            const rows = byCourse.get(courseId) ?? [];
            return rows.some(
              (row) =>
                row.status !== 'Dropped' && termIndex(row.term) < targetIndex,
            );
          });
          if (!satisfied) {
            continue;
          }

          const maxSequence = state.allStudentPlans
            .filter((plan) => plan.student_id === student._id)
            .reduce((max, plan) => Math.max(max, plan.plan_sequence), 0);
          const planId = nextStudentPlanId(state);
          const plan: StudentPlan = {
            _id: planId,
            student_id: student._id,
            program_id: student.program_id,
            course_id: dependentCourseId,
            term: targetTerm,
            plan_sequence: maxSequence + 1,
            planned_credits: dependentCourse.credits,
            status: 'Planned',
            created_at: input.asOf,
          };
          addStudentPlan(state, plan);
          addEvent(
            state,
            makeEvent(
              state,
              'StudentPlan',
              planId,
              null,
              'Planned',
              'Created',
              dateTime(AS_OF_DATE, '11:15:00'),
              'Injected anomaly: COURSE_SCHEDULED_BEFORE_PREREQUISITE',
            ),
          );
          addAnomaly(
            state,
            makeAnomaly(
              state,
              'COURSE_SCHEDULED_BEFORE_PREREQUISITE',
              'StudentPlan',
              planId,
              prerequisitePlan._id,
              'Move the course to a term after its prerequisite',
              'High',
              `Planned ${dependentCourseId} in ${targetTerm} before prerequisite ${prerequisitePlan.course_id} in ${prerequisitePlan.term}.`,
            ),
          );
          usedPrerequisiteStudents.add(student._id);
          return;
        }
      }
    }
    throw new Error('Unable to inject COURSE_SCHEDULED_BEFORE_PREREQUISITE anomaly');
  }

  function injectDuplicateSection(): void {
    const sectionCounts = new Map<string, number>();
    for (const section of state.allSections) {
      sectionCounts.set(
        section.course_id,
        (sectionCounts.get(section.course_id) ?? 0) + 1,
      );
    }

    for (const original of sectionSorted) {
      const course = state.courseById.get(original.course_id);
      if (!course || course.status !== 'Active') {
        continue;
      }
      if ((sectionCounts.get(course._id) ?? 0) >= MAX_SECTIONS_PER_COURSE) {
        continue;
      }
      const key = sectionBusinessKey(
        original.course_id,
        original.term,
        original.section_no,
      );
      if (usedDuplicateKeys.has(key)) {
        continue;
      }
      const capacity = original.capacity;
      if (capacity < MIN_SECTION_SIZE) {
        continue;
      }
      const originalSlot = SLOTS.find(
        (slot) =>
          slot.day === original.schedule_day &&
          slot.start === original.start_time,
      );
      const rooms = usableRoomsFor(input.rooms, course.course_type, capacity);
      for (const slot of SLOTS) {
        if (
          originalSlot &&
          slot.day === originalSlot.day &&
          slot.start === originalSlot.start
        ) {
          continue;
        }
        for (const room of rooms) {
          if (state.roomSlots.has(roomSlotKey(room._id, slot.day, slot.start))) {
            continue;
          }
          const candidate = facultyFor(course, slot, true, course.contact_hours);
          if (!candidate || !candidate.skill) {
            continue;
          }
          const sectionId = nextSectionId(state);
          const section: Section = {
            _id: sectionId,
            course_id: original.course_id,
            term: original.term,
            section_no: original.section_no,
            room_id: room._id,
            capacity,
            enrolled_count: original.enrolled_count,
            schedule_day: slot.day,
            start_time: slot.start,
            end_time: slot.end,
            delivery_mode: 'InPerson',
            status: 'Proposed',
            created_at: input.asOf,
          };
          addSection(state, section);

          const workloadId = nextWorkloadId(state);
          const workload: WorkloadAssignment = {
            _id: workloadId,
            faculty_id: candidate.faculty._id,
            section_id: sectionId,
            term: original.term,
            workload_units: course.contact_hours,
            assignment_role: 'Instructor',
            assigned_date: AS_OF_DATE,
            status: 'Proposed',
            created_at: input.asOf,
          };
          addWorkload(state, workload, section);

          const snapshot = makeSnapshot(
            slot,
            room,
            candidate.faculty,
            candidate.skill,
            candidate.remaining,
            `Injected duplicate of section ${original._id}.`,
          );
          const decisionId = nextDecisionId(state);
          addDecision(state, {
            _id: decisionId,
            section_id: sectionId,
            course_id: original.course_id,
            faculty_id: candidate.faculty._id,
            room_id: room._id,
            term: original.term,
            decision_type: 'SectionProposal',
            score: 50,
            candidate_snapshot: snapshot,
            rationale: `Injected anomaly fixture duplicating business key ${key}.`,
            created_at: input.asOf,
          });

          addEvent(
            state,
            makeEvent(
              state,
              'Section',
              sectionId,
              null,
              'Draft',
              'Created',
              dateTime(AS_OF_DATE, '11:20:00'),
              'Injected anomaly: DUPLICATE_SECTION_ASSIGNMENT',
            ),
          );
          addEvent(
            state,
            makeEvent(
              state,
              'Section',
              sectionId,
              'Draft',
              'Proposed',
              'StatusChanged',
              dateTime(AS_OF_DATE, '11:21:00'),
              'Injected anomaly: DUPLICATE_SECTION_ASSIGNMENT',
            ),
          );
          addEvent(
            state,
            makeEvent(
              state,
              'WorkloadAssignment',
              workloadId,
              null,
              'Proposed',
              'Assigned',
              dateTime(AS_OF_DATE, '11:22:00'),
              'Injected anomaly: DUPLICATE_SECTION_ASSIGNMENT',
            ),
          );
          addAnomaly(
            state,
            makeAnomaly(
              state,
              'DUPLICATE_SECTION_ASSIGNMENT',
              'Section',
              sectionId,
              original._id,
              'Remove or renumber the duplicate section',
              'Medium',
              `Added section ${sectionId} duplicating ${key}.`,
            ),
          );
          usedDuplicateKeys.add(key);
          return;
        }
      }
    }
    throw new Error('Unable to inject DUPLICATE_SECTION_ASSIGNMENT anomaly');
  }

  const injectors: Array<() => void> = [
    injectOutsideSkill,
    injectWorkloadExceeded,
    injectCapacityTooLow,
    injectPrerequisite,
    injectDuplicateSection,
  ];

  for (const injector of injectors) {
    for (let index = 0; index < input.anomalyPerType; index += 1) {
      injector();
    }
  }

  return {
    sections: state.newSections,
    workloadAssignments: state.newWorkloads,
    studentPlans: state.newStudentPlans,
    allocationDecisions: state.newDecisions,
    lifecycleEvents: state.newEvents,
    anomalies: state.anomalies,
  };
}

export async function prepareInjection(): Promise<void> {
  const anomalies = await GroundTruthAnomalyModel.find({})
    .lean<GroundTruthAnomaly[]>()
    .exec();
  if (anomalies.length === 0) {
    return;
  }

  const sectionIds = anomalies
    .filter((anomaly) => anomaly.entity_type === 'Section')
    .map((anomaly) => anomaly.entity_id);
  const workloadIds = anomalies
    .filter((anomaly) => anomaly.entity_type === 'WorkloadAssignment')
    .map((anomaly) => anomaly.entity_id);
  const studentPlanIds = anomalies
    .filter((anomaly) => anomaly.entity_type === 'StudentPlan')
    .map((anomaly) => anomaly.entity_id);

  const auxiliaryWorkloads =
    sectionIds.length > 0
      ? await WorkloadAssignmentModel.find({ section_id: { $in: sectionIds } })
          .lean<WorkloadAssignment[]>()
          .exec()
      : [];
  const allWorkloadIds = [
    ...workloadIds,
    ...auxiliaryWorkloads.map((workload) => workload._id),
  ];

  await Promise.all([
    SectionModel.deleteMany({ _id: { $in: sectionIds } }),
    WorkloadAssignmentModel.deleteMany({ _id: { $in: allWorkloadIds } }),
    AllocationDecisionModel.deleteMany({ section_id: { $in: sectionIds } }),
    StudentPlanModel.deleteMany({ _id: { $in: studentPlanIds } }),
    LifecycleEventModel.deleteMany({
      entity_id: { $in: [...sectionIds, ...allWorkloadIds, ...studentPlanIds] },
    }),
    GroundTruthAnomalyModel.deleteMany({}),
  ]);
}

export async function persistInjection(
  result: InjectionResult,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  counts.sections = await insertBatched(SectionModel, result.sections);
  counts.workloadAssignments = await insertBatched(
    WorkloadAssignmentModel,
    result.workloadAssignments,
  );
  counts.studentPlans = await insertBatched(StudentPlanModel, result.studentPlans);
  counts.allocationDecisions = await insertBatched(
    AllocationDecisionModel,
    result.allocationDecisions,
  );
  counts.lifecycleEvents = await insertBatched(
    LifecycleEventModel,
    result.lifecycleEvents,
  );
  counts.groundTruthAnomalies = await insertBatched(
    GroundTruthAnomalyModel,
    result.anomalies,
  );
  return counts;
}

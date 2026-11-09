import {
  DAYS_OF_WEEK,
  ID_PREFIXES,
  MAX_SECTIONS_PER_COURSE,
  MIN_SECTION_SIZE,
  PROFICIENCY_SCORE,
  TARGET_TERM,
  TERM_DATES,
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
  type LifecycleEvent,
  type Program,
  type Room,
  type RoomType,
  type Section,
  type UnmetDemand,
  type UnmetReason,
  type WorkloadAssignment,
} from '@yottaflex/shared';
import { insertBatched } from '../db.js';
import { dateTime } from '../lib/time.js';
import {
  AllocationDecisionModel,
  LifecycleEventModel,
  SectionModel,
  UnmetDemandModel,
  WorkloadAssignmentModel,
} from '../models/index.js';

const ROOM_COMPATIBILITY: Record<CourseType, readonly RoomType[]> = {
  Core: ['Lecture', 'Seminar'],
  Elective: ['Lecture', 'Seminar'],
  Lab: ['Lab', 'ComputerLab'],
  Seminar: ['Seminar', 'Lecture'],
};

const TARGET_YEAR = TARGET_TERM.slice(0, 4);
const TERM_DATES_TARGET = TERM_DATES[TARGET_TERM];

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

interface AllocationInput {
  courses: readonly Course[];
  forecasts: readonly DemandForecast[];
  faculty: readonly Faculty[];
  facultySkills: readonly FacultySkill[];
  availabilities: readonly Availability[];
  rooms: readonly Room[];
  programs: readonly Program[];
  asOf: string;
}

export interface AllocationResult {
  sections: Section[];
  workloadAssignments: WorkloadAssignment[];
  allocationDecisions: AllocationDecision[];
  unmetDemands: UnmetDemand[];
  lifecycleEvents: LifecycleEvent[];
}

interface AssignmentCandidate {
  faculty: Faculty;
  skill: FacultySkill;
  room: Room;
  slot: Slot;
  score: number;
  facultyCandidate: FacultyCandidate;
}

interface SearchResult {
  best: AssignmentCandidate | null;
  topCandidates: FacultyCandidate[];
  failureReason: UnmetReason;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slotKey(day: string, start: string): string {
  return `${day}:${start}`;
}

function roomKey(roomId: string, day: string, start: string): string {
  return `${roomId}:${day}:${start}`;
}

function facultyKey(facultyId: string, day: string, start: string): string {
  return `${facultyId}:${day}:${start}`;
}

function buildSkillIndex(
  skills: readonly FacultySkill[],
  facultyById: Map<string, Faculty>,
  asOfDate: string,
): Map<string, FacultySkill[]> {
  const index = new Map<string, FacultySkill[]>();
  for (const skill of skills) {
    if (skill.certified_date > asOfDate) {
      continue;
    }
    if (skill.expires_date !== null && skill.expires_date < asOfDate) {
      continue;
    }
    const faculty = facultyById.get(skill.faculty_id);
    if (!faculty || faculty.status !== 'Active') {
      continue;
    }
    const bucket = index.get(skill.course_id) ?? [];
    bucket.push(skill);
    index.set(skill.course_id, bucket);
  }
  return index;
}

function buildAvailabilityIndex(
  availabilities: readonly Availability[],
): Set<string> {
  const index = new Set<string>();
  for (const availability of availabilities) {
    if (
      availability.term !== TARGET_TERM ||
      availability.availability_type !== 'Available'
    ) {
      continue;
    }
    for (const slot of TIME_SLOTS) {
      if (
        availability.start_time <= slot.start &&
        availability.end_time >= slot.end
      ) {
        index.add(
          `${availability.faculty_id}:${slotKey(availability.day_of_week, slot.start)}`,
        );
      }
    }
  }
  return index;
}

function buildRoomsByType(
  rooms: readonly Room[],
  termStart: string,
  termEnd: string,
): Map<CourseType, Room[]> {
  const usable = rooms.filter(
    (room) =>
      room.status === 'Available' &&
      room.effective_start_date <= termStart &&
      (room.effective_end_date === null || room.effective_end_date >= termEnd),
  );
  const index = new Map<CourseType, Room[]>();
  for (const courseType of Object.keys(ROOM_COMPATIBILITY) as CourseType[]) {
    const compatible = usable
      .filter((room) => ROOM_COMPATIBILITY[courseType].includes(room.room_type))
      .sort(
        (left, right) =>
          left.capacity - right.capacity || left._id.localeCompare(right._id),
      );
    index.set(courseType, compatible);
  }
  return index;
}

function insertTopCandidate(
  candidates: FacultyCandidate[],
  candidate: FacultyCandidate,
  limit = 5,
): void {
  if (
    candidates.length >= limit &&
    compareCandidates(candidate, candidates[candidates.length - 1]!) >= 0
  ) {
    return;
  }
  candidates.push(candidate);
  candidates.sort(compareCandidates);
  if (candidates.length > limit) {
    candidates.length = limit;
  }
}

function compareCandidates(left: FacultyCandidate, right: FacultyCandidate): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.faculty_id.localeCompare(right.faculty_id);
}

function compareAssignments(
  left: AssignmentCandidate,
  right: AssignmentCandidate,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.faculty._id !== right.faculty._id) {
    return left.faculty._id.localeCompare(right.faculty._id);
  }
  if (left.room.capacity !== right.room.capacity) {
    return left.room.capacity - right.room.capacity;
  }
  if (left.slot.index !== right.slot.index) {
    return left.slot.index - right.slot.index;
  }
  return left.room._id.localeCompare(right.room._id);
}

function scoreCandidate(
  faculty: Faculty,
  skill: FacultySkill,
  course: Course,
  program: Program | undefined,
  assignedUnits: number,
  assignedSections: number,
): AssignmentCandidate['facultyCandidate'] {
  const remaining = faculty.max_workload_units - assignedUnits;
  const proficiencyScore = PROFICIENCY_SCORE[skill.proficiency] * 40;
  const workloadScore =
    faculty.max_workload_units > 0
      ? (remaining / faculty.max_workload_units) * 20
      : 0;
  const departmentMatch = program?.department === faculty.department;
  const departmentScore = departmentMatch ? 20 : 0;
  const fairnessScore = 20 / (1 + assignedSections);
  const score = proficiencyScore + workloadScore + departmentScore + fairnessScore;

  return {
    faculty_id: faculty._id,
    score: round2(score),
    proficiency: skill.proficiency,
    remaining_workload: remaining,
    department_match: departmentMatch,
    reasons: [
      `${skill.proficiency} proficiency`,
      departmentMatch ? 'Department match' : 'Outside home department',
      `Remaining workload ${remaining}`,
      `Assigned sections ${assignedSections}`,
    ],
  };
}

function searchAssignment(
  course: Course,
  program: Program | undefined,
  capacity: number,
  skills: readonly FacultySkill[],
  rooms: readonly Room[],
  facultyById: Map<string, Faculty>,
  availableSlots: Set<string>,
  bookedFaculty: Set<string>,
  bookedRooms: Set<string>,
  assignedUnits: Map<string, number>,
  assignedSections: Map<string, number>,
): SearchResult {
  let best: AssignmentCandidate | null = null;
  const topCandidates: FacultyCandidate[] = [];
  let sawCompatibleRoom = rooms.length > 0;
  let sawFreeRoomSlot = false;
  let sawAvailableFaculty = false;
  let sawWorkload = false;

  for (const slot of SLOTS) {
    for (const room of rooms) {
      if (room.capacity < capacity) {
        continue;
      }
      if (bookedRooms.has(roomKey(room._id, slot.day, slot.start))) {
        continue;
      }
      sawFreeRoomSlot = true;

      for (const skill of skills) {
        const faculty = facultyById.get(skill.faculty_id);
        if (!faculty) {
          continue;
        }
        if (!availableSlots.has(`${faculty._id}:${slotKey(slot.day, slot.start)}`)) {
          continue;
        }
        sawAvailableFaculty = true;

        const usedUnits = assignedUnits.get(faculty._id) ?? 0;
        if (faculty.max_workload_units - usedUnits < course.contact_hours) {
          continue;
        }
        sawWorkload = true;

        if (bookedFaculty.has(facultyKey(faculty._id, slot.day, slot.start))) {
          continue;
        }

        const facultyCandidate = scoreCandidate(
          faculty,
          skill,
          course,
          program,
          usedUnits,
          assignedSections.get(faculty._id) ?? 0,
        );
        insertTopCandidate(topCandidates, facultyCandidate);
        const candidate: AssignmentCandidate = {
          faculty,
          skill,
          room,
          slot,
          score: facultyCandidate.score,
          facultyCandidate,
        };
        if (!best || compareAssignments(candidate, best) < 0) {
          best = candidate;
        }
      }
    }
  }

  let failureReason: UnmetReason = 'CAPACITY_SHORTFALL';
  if (!sawCompatibleRoom || !sawFreeRoomSlot) {
    failureReason = 'NO_ROOM';
  } else if (!sawAvailableFaculty) {
    failureReason = 'NO_QUALIFIED_FACULTY';
  } else if (!sawWorkload) {
    failureReason = 'WORKLOAD_LIMIT';
  }

  return { best, topCandidates, failureReason };
}

export function buildAllocation(
  input: AllocationInput,
  lifecycleEventStart = 1,
): AllocationResult {
  const asOfDate = input.asOf.slice(0, 10);
  const facultyById = new Map(input.faculty.map((member) => [member._id, member]));
  const programById = new Map(input.programs.map((program) => [program._id, program]));
  const skillByCourse = buildSkillIndex(input.facultySkills, facultyById, asOfDate);
  const availableSlots = buildAvailabilityIndex(input.availabilities);
  const roomsByType = buildRoomsByType(
    input.rooms,
    TERM_DATES_TARGET.start,
    TERM_DATES_TARGET.end,
  );
  const forecastByCourse = new Map(
    input.forecasts
      .filter((forecast) => forecast.term === TARGET_TERM)
      .map((forecast) => [forecast.course_id, forecast]),
  );

  const courses = input.courses
    .filter((course) => course.status === 'Active')
    .sort((left, right) => {
      const leftForecast = forecastByCourse.get(left._id)?.forecast_enrollment ?? 0;
      const rightForecast = forecastByCourse.get(right._id)?.forecast_enrollment ?? 0;
      if (leftForecast !== rightForecast) {
        return rightForecast - leftForecast;
      }
      return left._id.localeCompare(right._id);
    });

  const sections: Section[] = [];
  const workloadAssignments: WorkloadAssignment[] = [];
  const allocationDecisions: AllocationDecision[] = [];
  const unmetDemands: UnmetDemand[] = [];
  const lifecycleEvents: LifecycleEvent[] = [];
  const bookedFaculty = new Set<string>();
  const bookedRooms = new Set<string>();
  const assignedUnits = new Map<string, number>();
  const assignedSections = new Map<string, number>();

  let sectionCounter = 0;
  let workloadCounter = 0;
  let decisionCounter = 0;
  let unmetCounter = 0;
  let eventCounter = lifecycleEventStart;

  const addEvent = (
    entityType: 'Section' | 'WorkloadAssignment',
    entityId: string,
    fromState: string | null,
    toState: string,
    eventType: 'Created' | 'StatusChanged' | 'Assigned',
    eventTs: string,
    reason: string,
  ): void => {
    eventCounter += 1;
    lifecycleEvents.push({
      _id: makeId(ID_PREFIXES.lifecycleEvent, eventCounter),
      entity_type: entityType,
      entity_id: entityId,
      from_state: fromState,
      to_state: toState,
      event_type: eventType,
      event_ts: eventTs,
      actor: 'Allocator',
      reason,
      created_at: input.asOf,
    });
  };

  const recordUnmet = (
    course: Course,
    forecastEnrollment: number,
    allocatedCapacity: number,
    reason: UnmetReason,
    details: Record<string, unknown>,
  ): void => {
    const unmetCount = Math.max(0, forecastEnrollment - allocatedCapacity);
    if (unmetCount === 0) {
      return;
    }
    unmetCounter += 1;
    unmetDemands.push({
      _id: makeTermId(ID_PREFIXES.unmetDemand, TARGET_YEAR, unmetCounter),
      course_id: course._id,
      term: TARGET_TERM,
      forecast_enrollment: forecastEnrollment,
      allocated_capacity: allocatedCapacity,
      unmet_count: unmetCount,
      reason_code: reason,
      details,
      created_at: input.asOf,
    });

    decisionCounter += 1;
    const snapshot: CandidateSnapshot = {
      slot: null,
      chosen_room_id: null,
      chosen_faculty_id: null,
      room_capacity: null,
      top_candidates: [],
      notes: reason,
    };
    allocationDecisions.push({
      _id: makeTermId(ID_PREFIXES.allocationDecision, TARGET_YEAR, decisionCounter),
      section_id: null,
      course_id: course._id,
      faculty_id: null,
      room_id: null,
      term: TARGET_TERM,
      decision_type: 'UnmetDemand',
      score: 0,
      candidate_snapshot: snapshot,
      rationale: `${reason}: forecast ${forecastEnrollment}, allocated capacity ${allocatedCapacity}, unmet ${unmetCount}.`,
      created_at: input.asOf,
    });
  };

  for (const course of courses) {
    const forecast = forecastByCourse.get(course._id)?.forecast_enrollment ?? 0;
    if (forecast <= 0) {
      continue;
    }

    const program = programById.get(course.program_id);
    const skills = skillByCourse.get(course._id) ?? [];
    const rooms = roomsByType.get(course.course_type) ?? [];

    if (skills.length === 0) {
      recordUnmet(course, forecast, 0, 'NO_QUALIFIED_FACULTY', {
        qualified_faculty: 0,
        required_sections: 0,
        created_sections: 0,
      });
      continue;
    }
    if (rooms.length === 0) {
      recordUnmet(course, forecast, 0, 'NO_ROOM', {
        compatible_rooms: 0,
        required_sections: 0,
        created_sections: 0,
      });
      continue;
    }

    const maxRoomCapacity = rooms[rooms.length - 1]?.capacity ?? 0;
    if (maxRoomCapacity < MIN_SECTION_SIZE) {
      recordUnmet(course, forecast, 0, 'NO_ROOM', {
        compatible_rooms: rooms.length,
        max_room_capacity: maxRoomCapacity,
      });
      continue;
    }

    const targetSectionSize = Math.min(course.max_section_size, maxRoomCapacity);
    if (targetSectionSize < MIN_SECTION_SIZE) {
      recordUnmet(course, forecast, 0, 'NO_ROOM', {
        compatible_rooms: rooms.length,
        target_section_size: targetSectionSize,
      });
      continue;
    }

    const requiredSections = Math.min(
      MAX_SECTIONS_PER_COURSE,
      Math.ceil(forecast / targetSectionSize),
    );
    let allocatedCapacity = 0;
    let remainingDemand = forecast;
    let createdSections = 0;
    let failureReason: UnmetReason = 'CAPACITY_SHORTFALL';

    for (let sectionNo = 1; sectionNo <= requiredSections; sectionNo += 1) {
      const capacity = targetSectionSize;
      const search = searchAssignment(
        course,
        program,
        capacity,
        skills,
        rooms,
        facultyById,
        availableSlots,
        bookedFaculty,
        bookedRooms,
        assignedUnits,
        assignedSections,
      );

      if (!search.best) {
        failureReason = search.failureReason;
        break;
      }

      const chosen = search.best;
      const enrolledCount = Math.min(capacity, remainingDemand);
      sectionCounter += 1;
      const sectionId = makeTermId(ID_PREFIXES.section, TARGET_YEAR, sectionCounter);
      sections.push({
        _id: sectionId,
        course_id: course._id,
        term: TARGET_TERM,
        section_no: sectionNo,
        room_id: chosen.room._id,
        capacity,
        enrolled_count: enrolledCount,
        schedule_day: chosen.slot.day,
        start_time: chosen.slot.start,
        end_time: chosen.slot.end,
        delivery_mode: 'InPerson',
        status: 'Proposed',
        created_at: input.asOf,
      });

      workloadCounter += 1;
      const workloadId = makeTermId(
        ID_PREFIXES.workloadAssignment,
        TARGET_YEAR,
        workloadCounter,
      );
      workloadAssignments.push({
        _id: workloadId,
        faculty_id: chosen.faculty._id,
        section_id: sectionId,
        term: TARGET_TERM,
        workload_units: course.contact_hours,
        assignment_role: 'Instructor',
        assigned_date: asOfDate,
        status: 'Proposed',
        created_at: input.asOf,
      });

      const snapshot: CandidateSnapshot = {
        slot: {
          day: chosen.slot.day,
          start_time: chosen.slot.start,
          end_time: chosen.slot.end,
        },
        chosen_room_id: chosen.room._id,
        chosen_faculty_id: chosen.faculty._id,
        room_capacity: chosen.room.capacity,
        top_candidates: search.topCandidates,
        notes: `Section ${sectionNo} of ${requiredSections}; capacity ${capacity}; enrolled ${enrolledCount}.`,
      };
      decisionCounter += 1;
      allocationDecisions.push({
        _id: makeTermId(ID_PREFIXES.allocationDecision, TARGET_YEAR, decisionCounter),
        section_id: sectionId,
        course_id: course._id,
        faculty_id: chosen.faculty._id,
        room_id: chosen.room._id,
        term: TARGET_TERM,
        decision_type: 'SectionProposal',
        score: chosen.score,
        candidate_snapshot: snapshot,
        rationale: `Assigned ${chosen.faculty._id} (${chosen.skill.proficiency}) and ${chosen.room._id} for ${chosen.slot.day} ${chosen.slot.start}-${chosen.slot.end}; score ${chosen.score}.`,
        created_at: input.asOf,
      });

      addEvent(
        'Section',
        sectionId,
        null,
        'Draft',
        'Created',
        dateTime(asOfDate, '09:00:00'),
        'Section drafted by allocator',
      );
      addEvent(
        'Section',
        sectionId,
        'Draft',
        'Proposed',
        'StatusChanged',
        dateTime(asOfDate, '10:00:00'),
        'Section proposed',
      );
      addEvent(
        'WorkloadAssignment',
        workloadId,
        null,
        'Proposed',
        'Assigned',
        dateTime(asOfDate, '10:30:00'),
        `Faculty assigned to ${sectionId}`,
      );

      bookedFaculty.add(facultyKey(chosen.faculty._id, chosen.slot.day, chosen.slot.start));
      bookedRooms.add(roomKey(chosen.room._id, chosen.slot.day, chosen.slot.start));
      assignedUnits.set(
        chosen.faculty._id,
        (assignedUnits.get(chosen.faculty._id) ?? 0) + course.contact_hours,
      );
      assignedSections.set(
        chosen.faculty._id,
        (assignedSections.get(chosen.faculty._id) ?? 0) + 1,
      );

      allocatedCapacity += capacity;
      remainingDemand -= enrolledCount;
      createdSections += 1;
      if (remainingDemand <= 0) {
        break;
      }
    }

    if (allocatedCapacity < forecast) {
      recordUnmet(course, forecast, allocatedCapacity, failureReason, {
        required_sections: requiredSections,
        created_sections: createdSections,
        target_section_size: targetSectionSize,
        max_sections_per_course: MAX_SECTIONS_PER_COURSE,
      });
    }
  }

  return {
    sections,
    workloadAssignments,
    allocationDecisions,
    unmetDemands,
    lifecycleEvents,
  };
}

export async function prepareAllocation(): Promise<number> {
  await Promise.all([
    AllocationDecisionModel.deleteMany({ term: TARGET_TERM }),
    UnmetDemandModel.deleteMany({ term: TARGET_TERM }),
    WorkloadAssignmentModel.deleteMany({ term: TARGET_TERM }),
    SectionModel.deleteMany({ term: TARGET_TERM }),
    LifecycleEventModel.deleteMany({
      entity_type: { $in: ['Section', 'WorkloadAssignment'] },
    }),
  ]);
  return (await LifecycleEventModel.countDocuments({})) + 1;
}

export async function persistAllocation(
  result: AllocationResult,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  counts.sections = await insertBatched(SectionModel, result.sections);
  counts.workloadAssignments = await insertBatched(
    WorkloadAssignmentModel,
    result.workloadAssignments,
  );
  counts.allocationDecisions = await insertBatched(
    AllocationDecisionModel,
    result.allocationDecisions,
  );
  counts.unmetDemands = await insertBatched(UnmetDemandModel, result.unmetDemands);
  counts.lifecycleEvents = await insertBatched(
    LifecycleEventModel,
    result.lifecycleEvents,
  );
  return counts;
}

import {
  AS_OF_DATE,
  DAYS_OF_WEEK,
  ID_PREFIXES,
  INTEREST_STATUS_WEIGHTS,
  INTEREST_TERMS,
  PLAN_TERMS,
  TARGET_TERM,
  TERM_DATES,
  TERM_DEMAND_FACTOR,
  TIME_SLOTS,
  makeId,
  type Actor,
  type Availability,
  type Course,
  type EntityType,
  type EventType,
  type Faculty,
  type InterestStatus,
  type Prerequisite,
  type Program,
  type RegistrationInterest,
  type Student,
  type StudentPlan,
  type StudentPlanStatus,
  type TermCode,
  Rng,
} from '@yottaflex/shared';
import {
  addDays,
  dateTime,
  maxDate,
  minDate,
  randomDate,
  termStart,
} from '../../lib/time.js';
import type { DatasetWithoutEvents, GeneratorConfig } from './types.js';

const AVAILABILITY_TYPE_WEIGHTS = [
  { value: 'Available' as const, weight: 85 },
  { value: 'Leave' as const, weight: 5 },
  { value: 'Unavailable' as const, weight: 10 },
];

const TARGET_PLAN_STATUS_WEIGHTS = [
  { value: 'Planned' as const, weight: 85 },
  { value: 'Registered' as const, weight: 10 },
  { value: 'Dropped' as const, weight: 5 },
];

const PAST_PLAN_STATUS_WEIGHTS = [
  { value: 'Completed' as const, weight: 85 },
  { value: 'Dropped' as const, weight: 10 },
  { value: 'Registered' as const, weight: 5 },
];

const INTEREST_SOURCE_WEIGHTS = [
  { value: 'SelfService' as const, weight: 60 },
  { value: 'Advisor' as const, weight: 40 },
];

type DemandTier = 'VeryHigh' | 'High' | 'Medium' | 'Low' | 'Zero';

const DEMAND_TIER_WEIGHTS = [
  { value: 'VeryHigh' as const, weight: 5 },
  { value: 'High' as const, weight: 15 },
  { value: 'Medium' as const, weight: 60 },
  { value: 'Low' as const, weight: 15 },
  { value: 'Zero' as const, weight: 5 },
];

const DEMAND_TIER_BASE: Record<DemandTier, number> = {
  VeryHigh: 90,
  High: 50,
  Medium: 20,
  Low: 6,
  Zero: 0,
};

interface SelectedPlanCourse {
  course: Course;
  termIndex: number;
}

function prereqsOf(
  courseId: string,
  prereqsByCourse: Map<string, string[]>,
): string[] {
  return prereqsByCourse.get(courseId) ?? [];
}

function completedCourseIds(student: Student, pool: Course[]): Set<string> {
  const threshold =
    student.cohort_year <= 2023 ? 200 : student.cohort_year === 2024 ? 100 : 0;
  if (threshold === 0) {
    return new Set<string>();
  }
  return new Set(
    pool.filter((course) => course.course_level <= threshold).map((course) => course._id),
  );
}

function selectPlanCourses(
  targetCount: number,
  pool: Course[],
  completedBefore: Set<string>,
  prereqsByCourse: Map<string, string[]>,
  rng: Rng,
): SelectedPlanCourse[] {
  const candidates = pool.filter((course) => !completedBefore.has(course._id));
  const safe = candidates.filter((course) =>
    prereqsOf(course._id, prereqsByCourse).every((prereq) => completedBefore.has(prereq)),
  );

  if (safe.length === 0) {
    const roots = candidates.filter(
      (course) => prereqsOf(course._id, prereqsByCourse).length === 0,
    );
    return rng
      .sample(roots, Math.min(targetCount, roots.length))
      .map((course, index) => ({ course, termIndex: Math.min(index, 2) }));
  }

  const rootCount = Math.max(0, targetCount - 1);
  const roots = rng.sample(safe, Math.min(rootCount, safe.length));
  const selectedIds = new Set(roots.map((course) => course._id));
  const dependentCandidates = candidates.filter(
    (course) =>
      !selectedIds.has(course._id) &&
      prereqsOf(course._id, prereqsByCourse).every(
        (prereq) => completedBefore.has(prereq) || selectedIds.has(prereq),
      ),
  );
  const withPrereqs = dependentCandidates.filter(
    (course) => prereqsOf(course._id, prereqsByCourse).length > 0,
  );
  const dependent =
    withPrereqs.length > 0
      ? rng.pick(withPrereqs)
      : dependentCandidates.length > 0
        ? rng.pick(dependentCandidates)
        : null;

  if (dependent) {
    selectedIds.add(dependent._id);
  }

  const result: SelectedPlanCourse[] = [];
  const sortedRoots = [...roots].sort((left, right) => left.course_level - right.course_level);
  sortedRoots.forEach((course, index) => {
    result.push({
      course,
      termIndex: dependent ? (index === 0 ? 0 : 1) : Math.min(index, 2),
    });
  });

  if (dependent) {
    result.push({ course: dependent, termIndex: 2 });
  }

  let extraIndex = 0;
  while (result.length < targetCount) {
    const remaining = safe.filter((course) => !selectedIds.has(course._id));
    if (remaining.length === 0) {
      break;
    }
    const next = rng.pick(remaining);
    selectedIds.add(next._id);
    result.push({ course: next, termIndex: Math.min(2, extraIndex + 1) });
    extraIndex += 1;
  }

  return result;
}

function planStatusFor(term: TermCode, rng: Rng): StudentPlanStatus {
  return term === TARGET_TERM
    ? rng.weighted(TARGET_PLAN_STATUS_WEIGHTS)
    : rng.weighted(PAST_PLAN_STATUS_WEIGHTS);
}

export function buildAvailabilities(
  config: GeneratorConfig,
  faculty: Faculty[],
  rng: Rng,
): Availability[] {
  const availabilities: Availability[] = [];
  let counter = 0;

  for (const member of faculty) {
    const used = new Set<string>();
    let availableCount = 0;

    const addSlot = (
      day: (typeof DAYS_OF_WEEK)[number],
      slot: (typeof TIME_SLOTS)[number],
      availabilityType: (typeof AVAILABILITY_TYPE_WEIGHTS)[number]['value'],
    ): void => {
      const key = `${day}:${slot.start}`;
      if (used.has(key)) {
        return;
      }
      used.add(key);
      counter += 1;
      if (availabilityType === 'Available') {
        availableCount += 1;
      }
      availabilities.push({
        _id: makeId(ID_PREFIXES.availability, counter),
        faculty_id: member._id,
        term: TARGET_TERM,
        day_of_week: day,
        start_time: slot.start,
        end_time: slot.end,
        availability_type: availabilityType,
        max_sessions: null,
        created_at: config.asOf,
      });
    };

    for (const day of DAYS_OF_WEEK) {
      for (const slot of TIME_SLOTS) {
        if (rng.bool(0.3)) {
          addSlot(day, slot, rng.weighted(AVAILABILITY_TYPE_WEIGHTS));
        }
      }
    }

    for (let attempts = 0; attempts < 20 && availableCount < 2; attempts += 1) {
      addSlot(rng.pick(DAYS_OF_WEEK), rng.pick(TIME_SLOTS), 'Available');
    }
  }

  return availabilities;
}

export function buildStudentPlans(
  config: GeneratorConfig,
  students: Student[],
  courses: Course[],
  prerequisites: Prerequisite[],
  rng: Rng,
): StudentPlan[] {
  const coursesByProgram = new Map<string, Course[]>();
  for (const course of courses) {
    const bucket = coursesByProgram.get(course.program_id) ?? [];
    bucket.push(course);
    coursesByProgram.set(course.program_id, bucket);
  }

  const prereqsByCourse = new Map<string, string[]>();
  for (const prerequisite of prerequisites) {
    const bucket = prereqsByCourse.get(prerequisite.course_id) ?? [];
    bucket.push(prerequisite.prerequisite_course_id);
    prereqsByCourse.set(prerequisite.course_id, bucket);
  }

  const plans: StudentPlan[] = [];
  const baseCount = Math.floor(config.studentPlans / students.length);
  const remainder = config.studentPlans % students.length;
  let counter = 0;

  students.forEach((student, studentIndex) => {
    const targetCount = baseCount + (studentIndex < remainder ? 1 : 0);
    if (targetCount <= 0) {
      return;
    }
    const programCourses = coursesByProgram.get(student.program_id) ?? [];
    const activeCourses = programCourses.filter((course) => course.status === 'Active');
    const pool = activeCourses.length >= targetCount ? activeCourses : programCourses;
    if (pool.length === 0) {
      return;
    }

    const completedBefore = completedCourseIds(student, pool);
    const selected = selectPlanCourses(
      targetCount,
      pool,
      completedBefore,
      prereqsByCourse,
      rng,
    );

    selected.forEach((entry, planIndex) => {
      counter += 1;
      const term = PLAN_TERMS[entry.termIndex] as TermCode;
      plans.push({
        _id: makeId(ID_PREFIXES.studentPlan, counter),
        student_id: student._id,
        program_id: student.program_id,
        course_id: entry.course._id,
        term,
        plan_sequence: planIndex + 1,
        planned_credits: entry.course.credits,
        status: planStatusFor(term, rng),
        created_at: config.asOf,
      });
    });
  });

  return plans;
}

function expressedAtForTerm(
  term: (typeof INTEREST_TERMS)[number],
  rng: Rng,
): string {
  if (term === TARGET_TERM) {
    return dateTime(randomDate(rng, '2026-03-01', '2026-07-31'), '10:00:00');
  }
  return dateTime(addDays(termStart(term), -rng.nextInt(20, 80)), '10:00:00');
}

function planInterestStatus(plan: StudentPlan): InterestStatus {
  if (plan.status === 'Dropped') {
    return 'Cancelled';
  }
  if (plan.status === 'Completed' || plan.status === 'Registered') {
    return 'Registered';
  }
  return 'Interested';
}

export function buildRegistrationInterests(
  config: GeneratorConfig,
  students: Student[],
  courses: Course[],
  programs: Program[],
  studentPlans: StudentPlan[],
  rng: Rng,
): RegistrationInterest[] {
  const programById = new Map(programs.map((program) => [program._id, program]));
  const studentsByProgram = new Map<string, Student[]>();
  for (const student of students) {
    const bucket = studentsByProgram.get(student.program_id) ?? [];
    bucket.push(student);
    studentsByProgram.set(student.program_id, bucket);
  }

  const plansByTermCourse = new Map<string, StudentPlan[]>();
  for (const plan of studentPlans) {
    const key = `${plan.term}:${plan.course_id}`;
    const bucket = plansByTermCourse.get(key) ?? [];
    bucket.push(plan);
    plansByTermCourse.set(key, bucket);
  }

  const tierByCourse = new Map<string, DemandTier>();
  for (const course of courses) {
    tierByCourse.set(course._id, rng.weighted(DEMAND_TIER_WEIGHTS));
  }

  const interests: RegistrationInterest[] = [];
  let counter = 0;

  for (const course of courses) {
    const tier = tierByCourse.get(course._id) ?? 'Medium';
    const program = programById.get(course.program_id);
    const programStudents = program ? studentsByProgram.get(program._id) ?? [] : [];

    for (const term of INTEREST_TERMS) {
      const noise = 0.8 + rng.nextFloat() * 0.4;
      const targetCount = Math.max(
        0,
        Math.round(DEMAND_TIER_BASE[tier] * TERM_DEMAND_FACTOR[term] * noise),
      );
      const usedStudents = new Set<string>();
      const planRows = plansByTermCourse.get(`${term}:${course._id}`) ?? [];

      for (const plan of planRows) {
        usedStudents.add(plan.student_id);
        counter += 1;
        interests.push({
          _id: makeId(ID_PREFIXES.registrationInterest, counter),
          student_id: plan.student_id,
          course_id: course._id,
          term,
          priority: 1,
          interest_status: planInterestStatus(plan),
          source: 'Plan',
          expressed_at: expressedAtForTerm(term, rng),
          created_at: config.asOf,
        });
      }

      const extraCount = Math.max(0, targetCount - planRows.length);
      if (extraCount === 0) {
        continue;
      }

      const preferredPool =
        programStudents.length >= extraCount ? programStudents : students;
      let chosen = rng.sample(
        preferredPool.filter((student) => !usedStudents.has(student._id)),
        extraCount,
      );
      if (chosen.length < extraCount) {
        const chosenIds = new Set(chosen.map((student) => student._id));
        const fallback = students.filter(
          (student) => !usedStudents.has(student._id) && !chosenIds.has(student._id),
        );
        chosen = [
          ...chosen,
          ...rng.sample(fallback, Math.min(extraCount - chosen.length, fallback.length)),
        ];
      }

      for (const student of chosen) {
        const status = rng.weighted(INTEREST_STATUS_WEIGHTS);
        counter += 1;
        interests.push({
          _id: makeId(ID_PREFIXES.registrationInterest, counter),
          student_id: student._id,
          course_id: course._id,
          term,
          priority: rng.nextInt(2, 5),
          interest_status: status,
          source: status === 'Waitlisted' ? 'Waitlist' : rng.weighted(INTEREST_SOURCE_WEIGHTS),
          expressed_at: expressedAtForTerm(term, rng),
          created_at: config.asOf,
        });
      }
    }
  }

  return interests;
}

export function buildLifecycleEvents(
  config: GeneratorConfig,
  dataset: DatasetWithoutEvents,
  rng: Rng,
): import('@yottaflex/shared').LifecycleEvent[] {
  const events: import('@yottaflex/shared').LifecycleEvent[] = [];
  let counter = 0;

  const addEvent = (
    entityType: EntityType,
    entityId: string,
    fromState: string | null,
    toState: string,
    eventType: EventType,
    eventTs: string,
    reason: string,
    actor: Actor = 'Generator',
  ): void => {
    counter += 1;
    events.push({
      _id: makeId(ID_PREFIXES.lifecycleEvent, counter),
      entity_type: entityType,
      entity_id: entityId,
      from_state: fromState,
      to_state: toState,
      event_type: eventType,
      event_ts: eventTs,
      actor,
      reason,
      created_at: config.asOf,
    });
  };

  const safeTs = (value: string, time = '09:00:00'): string =>
    dateTime(minDate(value, AS_OF_DATE), time);

  for (const term of dataset.terms) {
    const createdDate = addDays(term.start_date, -120);
    addEvent('Term', term._id, null, 'Planned', 'Created', safeTs(createdDate), 'Term planned');
    if (term.status === 'Closed') {
      addEvent(
        'Term',
        term._id,
        'Planned',
        'Active',
        'StatusChanged',
        safeTs(term.start_date),
        'Term opened',
      );
      addEvent(
        'Term',
        term._id,
        'Active',
        'Closed',
        'StatusChanged',
        safeTs(term.end_date),
        'Term closed',
      );
    }
  }

  for (const program of dataset.programs) {
    addEvent(
      'Program',
      program._id,
      null,
      'Active',
      'Created',
      safeTs(program.effective_start_date),
      'Program created',
    );
    if (program.status === 'Inactive') {
      addEvent(
        'Program',
        program._id,
        'Active',
        'Inactive',
        'StatusChanged',
        safeTs(program.effective_end_date ?? AS_OF_DATE),
        'Program retired',
      );
    }
  }

  for (const course of dataset.courses) {
    addEvent(
      'Course',
      course._id,
      null,
      'Active',
      'Created',
      safeTs(course.effective_start_date),
      'Course created',
    );
    if (course.status === 'Inactive') {
      addEvent(
        'Course',
        course._id,
        'Active',
        'Inactive',
        'StatusChanged',
        safeTs(course.effective_end_date ?? AS_OF_DATE),
        'Course retired',
      );
    }
  }

  for (const student of dataset.students) {
    const entryStart = TERM_DATES[student.entry_term].start;
    const createdDate = minDate(addDays(entryStart, -60), AS_OF_DATE);
    addEvent(
      'Student',
      student._id,
      null,
      'Active',
      'Created',
      safeTs(createdDate),
      'Student admitted',
    );
    if (student.status !== 'Active') {
      const changeDate =
        createdDate < AS_OF_DATE
          ? randomDate(rng, addDays(createdDate, 1), AS_OF_DATE)
          : AS_OF_DATE;
      addEvent(
        'Student',
        student._id,
        'Active',
        student.status,
        'StatusChanged',
        safeTs(changeDate),
        `Student marked ${student.status}`,
      );
    }
  }

  for (const member of dataset.faculty) {
    addEvent(
      'Faculty',
      member._id,
      null,
      'Active',
      'Created',
      safeTs(member.hire_date),
      'Faculty hired',
    );
    if (member.status !== 'Active') {
      const start = maxDate(member.hire_date, '2025-01-01');
      const changeDate =
        start < AS_OF_DATE ? randomDate(rng, addDays(start, 1), AS_OF_DATE) : AS_OF_DATE;
      addEvent(
        'Faculty',
        member._id,
        'Active',
        member.status,
        'StatusChanged',
        safeTs(changeDate),
        `Faculty marked ${member.status}`,
      );
    }
  }

  for (const room of dataset.rooms) {
    addEvent(
      'Room',
      room._id,
      null,
      'Available',
      'Created',
      safeTs(room.effective_start_date),
      'Room created',
    );
    if (room.status === 'Maintenance') {
      const changeDate = randomDate(rng, '2024-01-01', AS_OF_DATE);
      addEvent(
        'Room',
        room._id,
        'Available',
        'Maintenance',
        'StatusChanged',
        safeTs(changeDate),
        'Room under maintenance',
      );
    } else if (room.status === 'Inactive') {
      addEvent(
        'Room',
        room._id,
        'Available',
        'Inactive',
        'StatusChanged',
        safeTs(room.effective_end_date ?? AS_OF_DATE),
        'Room retired',
      );
    }
  }

  for (const plan of dataset.studentPlans) {
    const dates = TERM_DATES[plan.term];
    addEvent(
      'StudentPlan',
      plan._id,
      null,
      'Planned',
      'Created',
      safeTs(addDays(dates.start, -60)),
      'Course planned',
    );

    if (plan.status === 'Registered') {
      addEvent(
        'StudentPlan',
        plan._id,
        'Planned',
        'Registered',
        'StatusChanged',
        safeTs(addDays(dates.start, -30)),
        'Student registered',
      );
    } else if (plan.status === 'Completed') {
      addEvent(
        'StudentPlan',
        plan._id,
        'Planned',
        'Registered',
        'StatusChanged',
        safeTs(addDays(dates.start, -30)),
        'Student registered',
      );
      addEvent(
        'StudentPlan',
        plan._id,
        'Registered',
        'Completed',
        'StatusChanged',
        safeTs(dates.end),
        'Course completed',
      );
    } else if (plan.status === 'Dropped') {
      addEvent(
        'StudentPlan',
        plan._id,
        'Planned',
        'Dropped',
        'StatusChanged',
        safeTs(addDays(dates.start, -10)),
        'Plan dropped',
      );
    }
  }

  for (const interest of dataset.registrationInterests) {
    addEvent(
      'RegistrationInterest',
      interest._id,
      null,
      'Interested',
      'Created',
      interest.expressed_at,
      'Interest expressed',
      interest.source === 'Plan' ? 'Generator' : 'System',
    );
    if (interest.interest_status !== 'Interested') {
      const changeDate = addDays(
        interest.expressed_at.slice(0, 10),
        rng.nextInt(1, 20),
      );
      addEvent(
        'RegistrationInterest',
        interest._id,
        'Interested',
        interest.interest_status,
        'StatusChanged',
        safeTs(changeDate, '10:00:00'),
        `Interest marked ${interest.interest_status}`,
        'System',
      );
    }
  }

  return events;
}

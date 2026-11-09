import {
  COLLECTION_NAMES,
  HISTORY_TERMS,
  ID_PREFIXES,
  MIN_SECTION_SIZE,
  RULE_IDS,
  SCHEMA,
  TERM_CODES,
  TERM_DATES,
  TARGET_TERM,
  makeId,
  type AllocationDecision,
  type Availability,
  type CollectionName,
  type Course,
  type CourseType,
  type DemandForecast,
  type Faculty,
  type FacultySkill,
  type GroundTruthAnomaly,
  type IssueType,
  type LifecycleEvent,
  type Prerequisite,
  type Program,
  type RegistrationInterest,
  type Room,
  type RoomType,
  type ScaleName,
  type Section,
  type Severity,
  type Student,
  type StudentPlan,
  type Term,
  type UnmetDemand,
  type ValidationCheckSummary,
  type ValidationStatus,
  type ValidationSummary,
  type ValidationViolation,
  type WorkloadAssignment,
} from '@yottaflex/shared';
import { insertBatched } from '../db.js';
import { ValidationRunModel } from '../models/index.js';

const ROOM_COMPATIBILITY: Record<CourseType, readonly RoomType[]> = {
  Core: ['Lecture', 'Seminar'],
  Elective: ['Lecture', 'Seminar'],
  Lab: ['Lab', 'ComputerLab'],
  Seminar: ['Seminar', 'Lecture'],
};

const TERM_DATES_TARGET = TERM_DATES[TARGET_TERM];

export interface ValidationInput {
  terms: readonly Term[];
  programs: readonly Program[];
  courses: readonly Course[];
  prerequisites: readonly Prerequisite[];
  students: readonly Student[];
  studentPlans: readonly StudentPlan[];
  registrationInterests: readonly RegistrationInterest[];
  faculty: readonly Faculty[];
  facultySkills: readonly FacultySkill[];
  availabilities: readonly Availability[];
  rooms: readonly Room[];
  sections: readonly Section[];
  workloadAssignments: readonly WorkloadAssignment[];
  demandForecasts: readonly DemandForecast[];
  unmetDemands: readonly UnmetDemand[];
  allocationDecisions: readonly AllocationDecision[];
  lifecycleEvents: readonly LifecycleEvent[];
  groundTruthAnomalies: readonly GroundTruthAnomaly[];
  scale: ScaleName;
  seed: number;
  asOf: string;
}

export interface ValidationOutput {
  summary: ValidationSummary;
  violations: ValidationViolation[];
}

interface AnyDoc {
  _id: string;
  [key: string]: unknown;
}

interface RawViolation {
  check_id: string;
  severity: Severity;
  collection: string;
  entity_id: string;
  related_entity_id: string | null;
  message: string;
}

interface CheckDefinition {
  id: string;
  name: string;
}

const CHECK_DEFINITIONS: CheckDefinition[] = [
  { id: RULE_IDS.PK, name: 'Primary-key uniqueness' },
  { id: RULE_IDS.FK, name: 'Foreign-key integrity' },
  { id: RULE_IDS.ENUM, name: 'Allowed enums' },
  { id: RULE_IDS.DATE, name: 'Date ordering and effective windows' },
  { id: RULE_IDS.ARITH, name: 'Arithmetic reconciliation' },
  { id: RULE_IDS.LIFE, name: 'Lifecycle transitions and final state' },
  { id: RULE_IDS.DUP, name: 'Business-key duplicates' },
  { id: RULE_IDS.CAP, name: 'Section capacity and minimum size' },
  { id: RULE_IDS.SKILL, name: 'Faculty skill eligibility' },
  { id: RULE_IDS.WORKLOAD, name: 'Faculty workload limits' },
  { id: RULE_IDS.AVAIL, name: 'Faculty availability and leave' },
  { id: RULE_IDS.PREREQ, name: 'Prerequisite ordering' },
  { id: RULE_IDS.ROOM, name: 'Room compatibility and schedule conflicts' },
  { id: RULE_IDS.FORECAST, name: 'Forecast formula and historical provenance' },
  { id: RULE_IDS.UNMET, name: 'Demand, capacity, and unmet reconciliation' },
  { id: RULE_IDS.DECISION, name: 'Decision references and rationale' },
];

const ENTITY_TYPE_BY_COLLECTION: Partial<Record<CollectionName, string>> = {
  terms: 'Term',
  programs: 'Program',
  courses: 'Course',
  students: 'Student',
  studentPlans: 'StudentPlan',
  registrationInterests: 'RegistrationInterest',
  faculty: 'Faculty',
  rooms: 'Room',
  sections: 'Section',
  workloadAssignments: 'WorkloadAssignment',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function termIndex(term: string): number {
  return (TERM_CODES as readonly string[]).indexOf(term);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function groupBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item)) ?? [];
    bucket.push(item);
    groups.set(key(item), bucket);
  }
  return groups;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    timeToMinutes(aStart) < timeToMinutes(bEnd) &&
    timeToMinutes(bStart) < timeToMinutes(aEnd)
  );
}

function validSkill(
  skill: FacultySkill,
  asOfDate: string,
): boolean {
  return (
    skill.certified_date <= asOfDate &&
    (skill.expires_date === null || skill.expires_date >= asOfDate)
  );
}

function roomUsableForTerm(room: Room): boolean {
  return (
    room.status === 'Available' &&
    room.effective_start_date <= TERM_DATES_TARGET.start &&
    (room.effective_end_date === null ||
      room.effective_end_date >= TERM_DATES_TARGET.end)
  );
}

function violation(
  check: string,
  severity: Severity,
  collection: string,
  entityId: string,
  message: string,
  relatedEntityId: string | null = null,
): RawViolation {
  return {
    check_id: check,
    severity,
    collection,
    entity_id: entityId,
    related_entity_id: relatedEntityId,
    message,
  };
}

function loadedCollections(input: ValidationInput): Array<{
  name: CollectionName;
  docs: readonly AnyDoc[];
}> {
  return [
    { name: 'terms', docs: input.terms as unknown as readonly AnyDoc[] },
    { name: 'programs', docs: input.programs as unknown as readonly AnyDoc[] },
    { name: 'courses', docs: input.courses as unknown as readonly AnyDoc[] },
    {
      name: 'prerequisites',
      docs: input.prerequisites as unknown as readonly AnyDoc[],
    },
    { name: 'students', docs: input.students as unknown as readonly AnyDoc[] },
    {
      name: 'studentPlans',
      docs: input.studentPlans as unknown as readonly AnyDoc[],
    },
    {
      name: 'registrationInterests',
      docs: input.registrationInterests as unknown as readonly AnyDoc[],
    },
    { name: 'faculty', docs: input.faculty as unknown as readonly AnyDoc[] },
    {
      name: 'facultySkills',
      docs: input.facultySkills as unknown as readonly AnyDoc[],
    },
    {
      name: 'availabilities',
      docs: input.availabilities as unknown as readonly AnyDoc[],
    },
    { name: 'rooms', docs: input.rooms as unknown as readonly AnyDoc[] },
    { name: 'sections', docs: input.sections as unknown as readonly AnyDoc[] },
    {
      name: 'workloadAssignments',
      docs: input.workloadAssignments as unknown as readonly AnyDoc[],
    },
    {
      name: 'demandForecasts',
      docs: input.demandForecasts as unknown as readonly AnyDoc[],
    },
    {
      name: 'unmetDemands',
      docs: input.unmetDemands as unknown as readonly AnyDoc[],
    },
    {
      name: 'allocationDecisions',
      docs: input.allocationDecisions as unknown as readonly AnyDoc[],
    },
    {
      name: 'lifecycleEvents',
      docs: input.lifecycleEvents as unknown as readonly AnyDoc[],
    },
    {
      name: 'groundTruthAnomalies',
      docs: input.groundTruthAnomalies as unknown as readonly AnyDoc[],
    },
  ];
}

function checkPrimaryKeys(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  for (const collection of loadedCollections(input)) {
    const seen = new Set<string>();
    for (const doc of collection.docs) {
      if (seen.has(doc._id)) {
        violations.push(
          violation(
            RULE_IDS.PK,
            'High',
            collection.name,
            doc._id,
            `Duplicate primary key ${doc._id}.`,
          ),
        );
      } else {
        seen.add(doc._id);
      }
    }
  }
  return violations;
}

function checkForeignKeys(input: ValidationInput): RawViolation[] {
  const collections = loadedCollections(input);
  const idSets = new Map<string, Set<string>>();
  for (const collection of collections) {
    idSets.set(collection.name, new Set(collection.docs.map((doc) => doc._id)));
  }

  const violations: RawViolation[] = [];
  for (const collection of collections) {
    const meta = SCHEMA[collection.name];
    const fkFields = meta.fields.filter((field) => field.fk !== undefined);
    for (const doc of collection.docs) {
      for (const field of fkFields) {
        const value = doc[field.name];
        if (value === null || value === undefined) {
          continue;
        }
        const target = field.fk as CollectionName;
        if (!idSets.get(target)?.has(String(value))) {
          violations.push(
            violation(
              RULE_IDS.FK,
              'High',
              collection.name,
              doc._id,
              `${field.name} references missing ${target} ${String(value)}.`,
              String(value),
            ),
          );
        }
      }
    }
  }
  return violations;
}

function checkEnums(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  for (const collection of loadedCollections(input)) {
    const meta = SCHEMA[collection.name];
    const enumFields = meta.fields.filter((field) => Array.isArray(field.enum));
    for (const doc of collection.docs) {
      for (const field of enumFields) {
        const value = doc[field.name];
        if (value === null || value === undefined) {
          continue;
        }
        if (!field.enum?.includes(String(value))) {
          violations.push(
            violation(
              RULE_IDS.ENUM,
              'High',
              collection.name,
              doc._id,
              `${field.name} has invalid value ${String(value)}.`,
            ),
          );
        }
      }
    }
  }
  return violations;
}

function checkDates(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];

  for (const term of input.terms) {
    if (term.start_date > term.end_date) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'terms',
          term._id,
          `Term start ${term.start_date} is after end ${term.end_date}.`,
        ),
      );
    }
  }

  const effectiveWindows: Array<{
    collection: string;
    docs: ReadonlyArray<{ _id: string; effective_start_date: string; effective_end_date: string | null }>;
  }> = [
    { collection: 'programs', docs: input.programs },
    { collection: 'courses', docs: input.courses },
    { collection: 'prerequisites', docs: input.prerequisites },
    { collection: 'rooms', docs: input.rooms },
  ];
  for (const entry of effectiveWindows) {
    for (const doc of entry.docs) {
      if (
        doc.effective_end_date !== null &&
        doc.effective_start_date > doc.effective_end_date
      ) {
        violations.push(
          violation(
            RULE_IDS.DATE,
            'Medium',
            entry.collection,
            doc._id,
            `Effective start ${doc.effective_start_date} is after end ${doc.effective_end_date}.`,
          ),
        );
      }
    }
  }

  for (const availability of input.availabilities) {
    if (availability.start_time >= availability.end_time) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'availabilities',
          availability._id,
          `Availability start ${availability.start_time} is not before end ${availability.end_time}.`,
        ),
      );
    }
    if (termIndex(availability.term) < 0) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'availabilities',
          availability._id,
          `Unknown term ${availability.term}.`,
        ),
      );
    }
  }

  for (const section of input.sections) {
    if (section.start_time >= section.end_time) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'sections',
          section._id,
          `Section start ${section.start_time} is not before end ${section.end_time}.`,
        ),
      );
    }
    if (termIndex(section.term) < 0) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'sections',
          section._id,
          `Unknown term ${section.term}.`,
        ),
      );
    }
  }

  for (const workload of input.workloadAssignments) {
    if (termIndex(workload.term) < 0) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'workloadAssignments',
          workload._id,
          `Unknown term ${workload.term}.`,
        ),
      );
    }
  }

  for (const plan of input.studentPlans) {
    if (termIndex(plan.term) < 0) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'studentPlans',
          plan._id,
          `Unknown term ${plan.term}.`,
        ),
      );
    }
  }

  for (const interest of input.registrationInterests) {
    if (termIndex(interest.term) < 0) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'registrationInterests',
          interest._id,
          `Unknown term ${interest.term}.`,
        ),
      );
    }
    if (!isDateTime(interest.expressed_at)) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'Medium',
          'registrationInterests',
          interest._id,
          `Invalid expressed_at ${interest.expressed_at}.`,
        ),
      );
    }
  }

  for (const forecast of input.demandForecasts) {
    const historyTerms = [
      forecast.history_term_1,
      forecast.history_term_2,
      forecast.history_term_3,
    ];
    if (forecast.term !== TARGET_TERM) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'High',
          'demandForecasts',
          forecast._id,
          `Forecast term ${forecast.term} is not ${TARGET_TERM}.`,
        ),
      );
    }
    if (new Set(historyTerms).size !== 3) {
      violations.push(
        violation(
          RULE_IDS.DATE,
          'High',
          'demandForecasts',
          forecast._id,
          'Forecast history terms are not distinct.',
        ),
      );
    }
    for (const term of historyTerms) {
      if (!(HISTORY_TERMS as readonly string[]).includes(term)) {
        violations.push(
          violation(
            RULE_IDS.DATE,
            'High',
            'demandForecasts',
            forecast._id,
            `History term ${term} is not one of ${HISTORY_TERMS.join(', ')}.`,
          ),
        );
      }
      if (termIndex(term) >= termIndex(TARGET_TERM)) {
        violations.push(
          violation(
            RULE_IDS.DATE,
            'High',
            'demandForecasts',
            forecast._id,
            `History term ${term} is not earlier than ${TARGET_TERM}.`,
          ),
        );
      }
    }
  }

  return violations;
}

function checkArithmetic(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const courseById = new Map(input.courses.map((course) => [course._id, course]));
  const interestCounts = new Map<string, number>();
  for (const interest of input.registrationInterests) {
    if (interest.interest_status === 'Cancelled') {
      continue;
    }
    const key = `${interest.course_id}:${interest.term}`;
    interestCounts.set(key, (interestCounts.get(key) ?? 0) + 1);
  }

  for (const section of input.sections) {
    if (!isFiniteNumber(section.capacity) || section.capacity <= 0) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'sections',
          section._id,
          `Section capacity ${section.capacity} is not positive.`,
        ),
      );
    }
    if (
      !isFiniteNumber(section.enrolled_count) ||
      section.enrolled_count < 0 ||
      section.enrolled_count > section.capacity
    ) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'sections',
          section._id,
          `Enrolled count ${section.enrolled_count} is outside 0..${section.capacity}.`,
        ),
      );
    }
  }

  for (const workload of input.workloadAssignments) {
    if (!isFiniteNumber(workload.workload_units) || workload.workload_units < 0) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'workloadAssignments',
          workload._id,
          `Workload units ${workload.workload_units} is negative or invalid.`,
        ),
      );
    }
  }

  for (const plan of input.studentPlans) {
    const course = courseById.get(plan.course_id);
    if (course && plan.planned_credits !== course.credits) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'Medium',
          'studentPlans',
          plan._id,
          `Planned credits ${plan.planned_credits} do not match course credits ${course.credits}.`,
        ),
      );
    }
  }

  for (const forecast of input.demandForecasts) {
    const entries = [
      { term: forecast.history_term_1, value: forecast.hist_demand_1 },
      { term: forecast.history_term_2, value: forecast.hist_demand_2 },
      { term: forecast.history_term_3, value: forecast.hist_demand_3 },
    ].sort((left, right) => termIndex(left.term) - termIndex(right.term));
    const [oldest, middle, newest] = entries;
    if (!oldest || !middle || !newest) {
      continue;
    }

    const expectedHist = [
      { term: forecast.history_term_1, value: forecast.hist_demand_1 },
      { term: forecast.history_term_2, value: forecast.hist_demand_2 },
      { term: forecast.history_term_3, value: forecast.hist_demand_3 },
    ];
    for (const entry of expectedHist) {
      const expected = interestCounts.get(`${forecast.course_id}:${entry.term}`) ?? 0;
      if (entry.value !== expected) {
        violations.push(
          violation(
            RULE_IDS.ARITH,
            'High',
            'demandForecasts',
            forecast._id,
            `Historical demand for ${entry.term} is ${entry.value}, expected ${expected}.`,
          ),
        );
      }
    }

    const weighted = round2(
      newest.value * 0.5 + middle.value * 0.3 + oldest.value * 0.2,
    );
    const rawTrend = (newest.value - middle.value) * 0.1;
    const trendCap = weighted * 0.25;
    const trend = round2(Math.max(-trendCap, Math.min(trendCap, rawTrend)));
    const expectedForecast = Math.max(0, Math.round(weighted + trend));

    if (forecast.weighted_average !== weighted) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'demandForecasts',
          forecast._id,
          `Weighted average ${forecast.weighted_average} does not match ${weighted}.`,
        ),
      );
    }
    if (forecast.trend_adjustment !== trend) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'demandForecasts',
          forecast._id,
          `Trend adjustment ${forecast.trend_adjustment} does not match ${trend}.`,
        ),
      );
    }
    if (forecast.forecast_enrollment !== expectedForecast) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'demandForecasts',
          forecast._id,
          `Forecast ${forecast.forecast_enrollment} does not match ${expectedForecast}.`,
        ),
      );
    }
  }

  const forecastByCourse = new Map(
    input.demandForecasts
      .filter((forecast) => forecast.term === TARGET_TERM)
      .map((forecast) => [forecast.course_id, forecast]),
  );
  for (const unmet of input.unmetDemands) {
    const forecast = forecastByCourse.get(unmet.course_id);
    if (forecast && unmet.forecast_enrollment !== forecast.forecast_enrollment) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'unmetDemands',
          unmet._id,
          `Unmet forecast ${unmet.forecast_enrollment} does not match forecast ${forecast.forecast_enrollment}.`,
        ),
      );
    }
    if (
      unmet.unmet_count !==
      unmet.forecast_enrollment - unmet.allocated_capacity
    ) {
      violations.push(
        violation(
          RULE_IDS.ARITH,
          'High',
          'unmetDemands',
          unmet._id,
          `Unmet count ${unmet.unmet_count} does not equal forecast minus allocated capacity.`,
        ),
      );
    }
  }

  return violations;
}

function checkLifecycle(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const eventsByEntity = groupBy(
    input.lifecycleEvents,
    (event) => `${event.entity_type}:${event.entity_id}`,
  );
  const collections = loadedCollections(input);

  for (const collection of collections) {
    const entityType = ENTITY_TYPE_BY_COLLECTION[collection.name];
    const lifecycle = SCHEMA[collection.name].lifecycle;
    if (!entityType || !lifecycle) {
      continue;
    }
    for (const doc of collection.docs) {
      const events = (eventsByEntity.get(`${entityType}:${doc._id}`) ?? []).sort(
        (left, right) =>
          left.event_ts.localeCompare(right.event_ts) ||
          left._id.localeCompare(right._id),
      );
      if (events.length === 0) {
        violations.push(
          violation(
            RULE_IDS.LIFE,
            'Medium',
            collection.name,
            doc._id,
            'Entity has no lifecycle events.',
          ),
        );
        continue;
      }

      let failed = false;
      const first = events[0]!;
      if (first.from_state !== null) {
        failed = true;
      } else if (
        !(lifecycle.transitions.null ?? []).includes(first.to_state)
      ) {
        failed = true;
      }
      for (let index = 1; index < events.length && !failed; index += 1) {
        const previous = events[index - 1]!;
        const current = events[index]!;
        if (current.event_ts < previous.event_ts) {
          failed = true;
          break;
        }
        if (previous.to_state !== current.from_state) {
          failed = true;
          break;
        }
        const allowed = lifecycle.transitions[previous.to_state] ?? [];
        if (!allowed.includes(current.to_state)) {
          failed = true;
          break;
        }
      }
      const statusField = lifecycle.statusField;
      const status = doc[statusField];
      const last = events[events.length - 1]!;
      if (last.to_state !== status) {
        failed = true;
      }
      if (failed) {
        violations.push(
          violation(
            RULE_IDS.LIFE,
            'Medium',
            collection.name,
            doc._id,
            `Lifecycle history does not reconcile to status ${String(status)}.`,
          ),
        );
      }
    }
  }
  return violations;
}

function checkDuplicates(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const collections = loadedCollections(input);

  for (const collection of collections) {
    const uniqueIndexes = SCHEMA[collection.name].uniqueIndexes ?? [];
    for (const fields of uniqueIndexes) {
      const groups = groupBy(collection.docs, (doc) =>
        fields.map((field) => String(doc[field])).join('\u0001'),
      );
      for (const group of groups.values()) {
        if (group.length <= 1) {
          continue;
        }
        const sorted = [...group].sort((left, right) =>
          left._id.localeCompare(right._id),
        );
        for (const duplicate of sorted.slice(1)) {
          violations.push(
            violation(
              RULE_IDS.DUP,
              'High',
              collection.name,
              duplicate._id,
              `Duplicate business key (${fields.join(', ')}).`,
            ),
          );
        }
      }
    }
  }

  const sectionGroups = groupBy(
    input.sections,
    (section) =>
      `${section.course_id}\u0001${section.term}\u0001${section.section_no}`,
  );
  for (const group of sectionGroups.values()) {
    if (group.length <= 1) {
      continue;
    }
    const sorted = [...group].sort((left, right) =>
      left._id.localeCompare(right._id),
    );
    for (const duplicate of sorted.slice(1)) {
      violations.push(
        violation(
          RULE_IDS.DUP,
          'High',
          'sections',
          duplicate._id,
          `Duplicate section business key (${duplicate.course_id}, ${duplicate.term}, ${duplicate.section_no}).`,
        ),
      );
    }
  }

  return violations;
}

function checkCapacity(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  for (const section of input.sections) {
    if (section.capacity < MIN_SECTION_SIZE) {
      violations.push(
        violation(
          RULE_IDS.CAP,
          'High',
          'sections',
          section._id,
          `Section capacity ${section.capacity} is below minimum ${MIN_SECTION_SIZE}.`,
        ),
      );
    }
  }
  return violations;
}

function checkSkills(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const asOfDate = input.asOf.slice(0, 10);
  const skillIndex = new Map<string, FacultySkill>();
  for (const skill of input.facultySkills) {
    if (!validSkill(skill, asOfDate)) {
      continue;
    }
    skillIndex.set(`${skill.faculty_id}:${skill.course_id}`, skill);
  }
  const sectionById = new Map(input.sections.map((section) => [section._id, section]));
  const courseById = new Map(input.courses.map((course) => [course._id, course]));

  for (const workload of input.workloadAssignments) {
    const section = sectionById.get(workload.section_id);
    if (!section) {
      continue;
    }
    const course = courseById.get(section.course_id);
    if (!course) {
      continue;
    }
    if (!skillIndex.has(`${workload.faculty_id}:${course._id}`)) {
      violations.push(
        violation(
          RULE_IDS.SKILL,
          'High',
          'workloadAssignments',
          workload._id,
          `Faculty ${workload.faculty_id} has no valid skill for ${course._id}.`,
          section._id,
        ),
      );
    }
  }
  return violations;
}

function checkWorkload(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const facultyById = new Map(input.faculty.map((member) => [member._id, member]));
  const byFaculty = groupBy(
    input.workloadAssignments,
    (workload) => workload.faculty_id,
  );

  for (const [facultyId, workloads] of byFaculty) {
    const faculty = facultyById.get(facultyId);
    if (!faculty) {
      continue;
    }
    const sorted = [...workloads].sort((left, right) =>
      left._id.localeCompare(right._id),
    );
    let total = 0;
    for (const workload of sorted) {
      total += workload.workload_units;
      if (total > faculty.max_workload_units) {
        violations.push(
          violation(
            RULE_IDS.WORKLOAD,
            'High',
            'workloadAssignments',
            workload._id,
            `Faculty ${facultyId} total workload ${total} exceeds max ${faculty.max_workload_units}.`,
            facultyId,
          ),
        );
        break;
      }
    }
  }
  return violations;
}

function checkAvailability(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const facultyById = new Map(input.faculty.map((member) => [member._id, member]));
  const sectionById = new Map(input.sections.map((section) => [section._id, section]));
  const availabilityByFacultyDay = groupBy(
    input.availabilities.filter(
      (availability) =>
        availability.term === TARGET_TERM &&
        availability.availability_type === 'Available',
    ),
    (availability) => `${availability.faculty_id}:${availability.day_of_week}`,
  );

  for (const workload of input.workloadAssignments) {
    const faculty = facultyById.get(workload.faculty_id);
    if (!faculty) {
      continue;
    }
    if (faculty.status !== 'Active') {
      violations.push(
        violation(
          RULE_IDS.AVAIL,
          'High',
          'workloadAssignments',
          workload._id,
          `Faculty ${workload.faculty_id} is ${faculty.status}, not Active.`,
          workload.faculty_id,
        ),
      );
    }
    const section = sectionById.get(workload.section_id);
    if (!section) {
      continue;
    }
    const windows =
      availabilityByFacultyDay.get(
        `${workload.faculty_id}:${section.schedule_day}`,
      ) ?? [];
    const covered = windows.some(
      (window) =>
        window.start_time <= section.start_time &&
        window.end_time >= section.end_time,
    );
    if (!covered) {
      violations.push(
        violation(
          RULE_IDS.AVAIL,
          'High',
          'workloadAssignments',
          workload._id,
          `Faculty ${workload.faculty_id} has no Available window covering ${section.schedule_day} ${section.start_time}-${section.end_time}.`,
          section._id,
        ),
      );
    }
  }
  return violations;
}

function checkPrerequisites(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const strictByCourse = new Map<string, string[]>();
  const allByCourse = new Map<string, string[]>();
  for (const prerequisite of input.prerequisites) {
    const allBucket = allByCourse.get(prerequisite.course_id) ?? [];
    allBucket.push(prerequisite.prerequisite_course_id);
    allByCourse.set(prerequisite.course_id, allBucket);

    if (prerequisite.is_strict) {
      const bucket = strictByCourse.get(prerequisite.course_id) ?? [];
      bucket.push(prerequisite.prerequisite_course_id);
      strictByCourse.set(prerequisite.course_id, bucket);
    }
  }

  const studentById = new Map(input.students.map((student) => [student._id, student]));
  const coursesByProgram = groupBy(input.courses, (course) => course.program_id);
  const implicitCompletionCache = new Map<string, Set<string>>();
  function implicitCompleted(studentId: string): Set<string> {
    const student = studentById.get(studentId);
    if (!student) {
      return new Set<string>();
    }
    const threshold =
      student.cohort_year <= 2023
        ? 200
        : student.cohort_year === 2024
          ? 100
          : 0;
    const key = `${student.program_id}:${threshold}`;
    const cached = implicitCompletionCache.get(key);
    if (cached) {
      return cached;
    }
    const completed = new Set(
      (coursesByProgram.get(student.program_id) ?? [])
        .filter((course) => course.course_level <= threshold)
        .map((course) => course._id),
    );
    implicitCompletionCache.set(key, completed);
    return completed;
  }

  const plansByStudent = groupBy(input.studentPlans, (plan) => plan.student_id);
  for (const [studentId, plans] of plansByStudent) {
    const byCourse = groupBy(plans, (plan) => plan.course_id);
    const completedBefore = implicitCompleted(studentId);
    for (const plan of plans) {
      if (plan.status === 'Dropped') {
        continue;
      }
      const prerequisites = strictByCourse.get(plan.course_id) ?? [];
      for (const prerequisiteCourseId of prerequisites) {
        if (completedBefore.has(prerequisiteCourseId)) {
          continue;
        }
        const prerequisitePlans = byCourse.get(prerequisiteCourseId) ?? [];
        const satisfied = prerequisitePlans.some(
          (candidate) => termIndex(candidate.term) < termIndex(plan.term),
        );
        if (!satisfied) {
          violations.push(
            violation(
              RULE_IDS.PREREQ,
              'High',
              'studentPlans',
              plan._id,
              `Student ${studentId} planned ${plan.course_id} in ${plan.term} before prerequisite ${prerequisiteCourseId}.`,
              prerequisiteCourseId,
            ),
          );
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  function visit(courseId: string): void {
    if (visiting.has(courseId)) {
      if (!reported.has(courseId)) {
        reported.add(courseId);
        violations.push(
          violation(
            RULE_IDS.PREREQ,
            'High',
            'prerequisites',
            courseId,
            `Prerequisite cycle detected at ${courseId}.`,
          ),
        );
      }
      return;
    }
    if (visited.has(courseId)) {
      return;
    }
    visiting.add(courseId);
    for (const prerequisite of allByCourse.get(courseId) ?? []) {
      if (prerequisite === courseId) {
        if (!reported.has(courseId)) {
          reported.add(courseId);
          violations.push(
            violation(
              RULE_IDS.PREREQ,
              'High',
              'prerequisites',
              courseId,
              `Course ${courseId} is its own prerequisite.`,
            ),
          );
        }
        continue;
      }
      visit(prerequisite);
    }
    visiting.delete(courseId);
    visited.add(courseId);
  }
  for (const courseId of allByCourse.keys()) {
    visit(courseId);
  }

  return violations;
}

function checkRooms(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const roomById = new Map(input.rooms.map((room) => [room._id, room]));
  const courseById = new Map(input.courses.map((course) => [course._id, course]));
  const sectionById = new Map(input.sections.map((section) => [section._id, section]));
  const reportedSections = new Set<string>();
  const reportedWorkloads = new Set<string>();

  for (const section of input.sections) {
    if (!section.room_id) {
      violations.push(
        violation(
          RULE_IDS.ROOM,
          'High',
          'sections',
          section._id,
          'Section has no assigned room.',
        ),
      );
      continue;
    }
    const room = roomById.get(section.room_id);
    if (!room) {
      continue;
    }
    const course = courseById.get(section.course_id);
    if (!roomUsableForTerm(room)) {
      violations.push(
        violation(
          RULE_IDS.ROOM,
          'High',
          'sections',
          section._id,
          `Room ${room._id} is not Available for ${TARGET_TERM}.`,
          room._id,
        ),
      );
    } else if (
      course &&
      !ROOM_COMPATIBILITY[course.course_type].includes(room.room_type)
    ) {
      violations.push(
        violation(
          RULE_IDS.ROOM,
          'High',
          'sections',
          section._id,
          `Room type ${room.room_type} is incompatible with ${course.course_type}.`,
          room._id,
        ),
      );
    } else if (room.capacity < section.capacity) {
      violations.push(
        violation(
          RULE_IDS.ROOM,
          'High',
          'sections',
          section._id,
          `Room capacity ${room.capacity} is below section capacity ${section.capacity}.`,
          room._id,
        ),
      );
    }
  }

  const byRoom = groupBy(
    input.sections.filter((section) => section.room_id !== null),
    (section) =>
      `${section.room_id}\u0001${section.term}\u0001${section.schedule_day}`,
  );
  for (const group of byRoom.values()) {
    const sorted = [...group].sort(
      (left, right) =>
        left.start_time.localeCompare(right.start_time) ||
        left._id.localeCompare(right._id),
    );
    for (let index = 0; index < sorted.length; index += 1) {
      for (let other = index + 1; other < sorted.length; other += 1) {
        const left = sorted[index]!;
        const right = sorted[other]!;
        if (overlaps(left.start_time, left.end_time, right.start_time, right.end_time)) {
          const later = left._id > right._id ? left : right;
          if (!reportedSections.has(later._id)) {
            reportedSections.add(later._id);
            violations.push(
              violation(
                RULE_IDS.ROOM,
                'High',
                'sections',
                later._id,
                `Room ${later.room_id} is double-booked on ${later.schedule_day} ${later.start_time}-${later.end_time}.`,
                later.room_id,
              ),
            );
          }
        }
      }
    }
  }

  const byFaculty = groupBy(
    input.workloadAssignments,
    (workload) => {
      const section = sectionById.get(workload.section_id);
      return section
        ? `${workload.faculty_id}\u0001${section.term}\u0001${section.schedule_day}`
        : `${workload.faculty_id}\u0001unknown`;
    },
  );
  for (const group of byFaculty.values()) {
    const sorted = [...group].sort((left, right) => {
      const leftSection = sectionById.get(left.section_id);
      const rightSection = sectionById.get(right.section_id);
      return (
        (leftSection?.start_time ?? '').localeCompare(
          rightSection?.start_time ?? '',
        ) || left._id.localeCompare(right._id)
      );
    });
    for (let index = 0; index < sorted.length; index += 1) {
      for (let other = index + 1; other < sorted.length; other += 1) {
        const left = sorted[index]!;
        const right = sorted[other]!;
        const leftSection = sectionById.get(left.section_id);
        const rightSection = sectionById.get(right.section_id);
        if (!leftSection || !rightSection) {
          continue;
        }
        if (
          overlaps(
            leftSection.start_time,
            leftSection.end_time,
            rightSection.start_time,
            rightSection.end_time,
          )
        ) {
          const later = left._id > right._id ? left : right;
          if (!reportedWorkloads.has(later._id)) {
            reportedWorkloads.add(later._id);
            violations.push(
              violation(
                RULE_IDS.ROOM,
                'High',
                'workloadAssignments',
                later._id,
                `Faculty ${later.faculty_id} is double-booked on ${leftSection.schedule_day} ${leftSection.start_time}-${leftSection.end_time}.`,
                later.faculty_id,
              ),
            );
          }
        }
      }
    }
  }

  return violations;
}

function checkForecast(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const interestCounts = new Map<string, number>();
  for (const interest of input.registrationInterests) {
    if (interest.interest_status === 'Cancelled') {
      continue;
    }
    const key = `${interest.course_id}:${interest.term}`;
    interestCounts.set(key, (interestCounts.get(key) ?? 0) + 1);
  }

  for (const forecast of input.demandForecasts) {
    const history = [
      { term: forecast.history_term_1, value: forecast.hist_demand_1 },
      { term: forecast.history_term_2, value: forecast.hist_demand_2 },
      { term: forecast.history_term_3, value: forecast.hist_demand_3 },
    ];
    for (const entry of history) {
      const expected = interestCounts.get(`${forecast.course_id}:${entry.term}`) ?? 0;
      if (entry.value !== expected) {
        violations.push(
          violation(
            RULE_IDS.FORECAST,
            'High',
            'demandForecasts',
            forecast._id,
            `Stored demand for ${entry.term} is ${entry.value}, expected ${expected}.`,
          ),
        );
      }
    }
    const sorted = [...history].sort(
      (left, right) => termIndex(left.term) - termIndex(right.term),
    );
    const oldest = sorted[0];
    const middle = sorted[1];
    const newest = sorted[2];
    if (!oldest || !middle || !newest) {
      continue;
    }
    const weighted = round2(
      newest.value * 0.5 + middle.value * 0.3 + oldest.value * 0.2,
    );
    const rawTrend = (newest.value - middle.value) * 0.1;
    const trendCap = weighted * 0.25;
    const trend = round2(Math.max(-trendCap, Math.min(trendCap, rawTrend)));
    const expectedForecast = Math.max(0, Math.round(weighted + trend));
    if (
      forecast.weighted_average !== weighted ||
      forecast.trend_adjustment !== trend ||
      forecast.forecast_enrollment !== expectedForecast
    ) {
      violations.push(
        violation(
          RULE_IDS.FORECAST,
          'High',
          'demandForecasts',
          forecast._id,
          'Forecast formula inputs or outputs do not reconcile.',
        ),
      );
    }
  }
  return violations;
}

function effectiveCapacity(
  input: ValidationInput,
  courseId: string,
  forecastEnrollment: number,
): number {
  const roomById = new Map(input.rooms.map((room) => [room._id, room]));
  const courseById = new Map(input.courses.map((course) => [course._id, course]));
  const course = courseById.get(courseId);
  const sections = input.sections.filter(
    (section) => section.course_id === courseId && section.term === TARGET_TERM,
  );
  const canonicalByKey = new Map<string, Section>();
  for (const section of sections) {
    const key = `${section.course_id}\u0001${section.term}\u0001${section.section_no}`;
    const existing = canonicalByKey.get(key);
    if (!existing || section._id < existing._id) {
      canonicalByKey.set(key, section);
    }
  }
  const canonicalIds = new Set(
    [...canonicalByKey.values()].map((section) => section._id),
  );

  let capacity = 0;
  for (const section of sections) {
    if (!canonicalIds.has(section._id)) {
      continue;
    }
    if (section.capacity < MIN_SECTION_SIZE) {
      continue;
    }
    const room = section.room_id ? roomById.get(section.room_id) : undefined;
    if (!room || !roomUsableForTerm(room)) {
      continue;
    }
    if (course && !ROOM_COMPATIBILITY[course.course_type].includes(room.room_type)) {
      continue;
    }
    if (room.capacity < section.capacity) {
      continue;
    }
    capacity += section.capacity;
  }
  return Math.min(capacity, forecastEnrollment);
}

function checkUnmet(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const forecastByCourse = new Map(
    input.demandForecasts
      .filter((forecast) => forecast.term === TARGET_TERM)
      .map((forecast) => [forecast.course_id, forecast]),
  );
  const unmetByCourse = groupBy(
    input.unmetDemands,
    (unmet) => unmet.course_id,
  );

  for (const [courseId, forecast] of forecastByCourse) {
    const unmetDocs = unmetByCourse.get(courseId) ?? [];
    const unmetTotal = unmetDocs.reduce(
      (sum, unmet) => sum + unmet.unmet_count,
      0,
    );
    const capacity = effectiveCapacity(
      input,
      courseId,
      forecast.forecast_enrollment,
    );
    if (forecast.forecast_enrollment !== capacity + unmetTotal) {
      violations.push(
        violation(
          RULE_IDS.UNMET,
          'High',
          'demandForecasts',
          forecast._id,
          `Forecast ${forecast.forecast_enrollment} does not equal effective capacity ${capacity} plus unmet ${unmetTotal}.`,
          courseId,
        ),
      );
    }
    for (const unmet of unmetDocs) {
      if (unmet.forecast_enrollment !== forecast.forecast_enrollment) {
        violations.push(
          violation(
            RULE_IDS.UNMET,
            'High',
            'unmetDemands',
            unmet._id,
            `Unmet forecast ${unmet.forecast_enrollment} does not match ${forecast.forecast_enrollment}.`,
            courseId,
          ),
        );
      }
      if (
        unmet.unmet_count !==
        unmet.forecast_enrollment - unmet.allocated_capacity
      ) {
        violations.push(
          violation(
            RULE_IDS.UNMET,
            'High',
            'unmetDemands',
            unmet._id,
            `Unmet count ${unmet.unmet_count} does not equal forecast minus allocated capacity.`,
            courseId,
          ),
        );
      }
      if (unmet.allocated_capacity !== capacity) {
        violations.push(
          violation(
            RULE_IDS.UNMET,
            'High',
            'unmetDemands',
            unmet._id,
            `Recorded allocated capacity ${unmet.allocated_capacity} does not match effective capacity ${capacity}.`,
            courseId,
          ),
        );
      }
    }
  }
  return violations;
}

function checkDecisions(input: ValidationInput): RawViolation[] {
  const violations: RawViolation[] = [];
  const sectionById = new Map(input.sections.map((section) => [section._id, section]));
  const workloadBySection = groupBy(
    input.workloadAssignments,
    (workload) => workload.section_id,
  );
  const decisionsBySection = groupBy(
    input.allocationDecisions.filter(
      (decision) => decision.decision_type === 'SectionProposal',
    ),
    (decision) => decision.section_id ?? '',
  );
  const unmetDecisionCourse = new Set(
    input.allocationDecisions
      .filter((decision) => decision.decision_type === 'UnmetDemand')
      .map((decision) => decision.course_id),
  );

  for (const decision of input.allocationDecisions) {
    if (decision.term !== TARGET_TERM) {
      violations.push(
        violation(
          RULE_IDS.DECISION,
          'Medium',
          'allocationDecisions',
          decision._id,
          `Decision term ${decision.term} is not ${TARGET_TERM}.`,
        ),
      );
    }
    if (!decision.rationale || decision.rationale.trim().length === 0) {
      violations.push(
        violation(
          RULE_IDS.DECISION,
          'Medium',
          'allocationDecisions',
          decision._id,
          'Decision rationale is empty.',
        ),
      );
    }

    if (decision.decision_type === 'SectionProposal') {
      const section = decision.section_id
        ? sectionById.get(decision.section_id)
        : undefined;
      if (!section) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'High',
            'allocationDecisions',
            decision._id,
            'Section proposal references a missing section.',
          ),
        );
        continue;
      }
      if (decision.course_id !== section.course_id) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Decision course does not match section course.',
            section._id,
          ),
        );
      }
      const assignedFaculty = new Set(
        (workloadBySection.get(section._id) ?? []).map(
          (workload) => workload.faculty_id,
        ),
      );
      if (!decision.faculty_id || !assignedFaculty.has(decision.faculty_id)) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'High',
            'allocationDecisions',
            decision._id,
            'Decision faculty does not match a section workload assignment.',
            section._id,
          ),
        );
      }
      if (decision.room_id !== section.room_id) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Decision room does not match section room.',
            section._id,
          ),
        );
      }
      if (!isFiniteNumber(decision.score)) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Decision score is not finite.',
          ),
        );
      }
      const snapshot = decision.candidate_snapshot;
      if (
        !snapshot ||
        !snapshot.slot ||
        snapshot.chosen_room_id !== decision.room_id ||
        snapshot.chosen_faculty_id !== decision.faculty_id ||
        !Array.isArray(snapshot.top_candidates) ||
        snapshot.top_candidates.length === 0 ||
        !snapshot.notes
      ) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Section proposal candidate snapshot is incomplete.',
            section._id,
          ),
        );
      }
    } else if (decision.decision_type === 'UnmetDemand') {
      if (decision.section_id !== null) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Unmet demand decision must not reference a section.',
          ),
        );
      }
      if (!decision.candidate_snapshot?.notes) {
        violations.push(
          violation(
            RULE_IDS.DECISION,
            'Medium',
            'allocationDecisions',
            decision._id,
            'Unmet demand candidate snapshot has no notes.',
          ),
        );
      }
    }
  }

  for (const section of input.sections) {
    if ((decisionsBySection.get(section._id) ?? []).length === 0) {
      violations.push(
        violation(
          RULE_IDS.DECISION,
          'Medium',
          'sections',
          section._id,
          'Section has no SectionProposal decision.',
        ),
      );
    }
  }

  for (const unmet of input.unmetDemands) {
    if (!unmetDecisionCourse.has(unmet.course_id)) {
      violations.push(
        violation(
          RULE_IDS.DECISION,
          'Medium',
          'unmetDemands',
          unmet._id,
          'Unmet demand has no UnmetDemand decision.',
        ),
      );
    }
  }

  return violations;
}

export function runValidation(input: ValidationInput): ValidationOutput {
  const rawViolations: RawViolation[] = [
    ...checkPrimaryKeys(input),
    ...checkForeignKeys(input),
    ...checkEnums(input),
    ...checkDates(input),
    ...checkArithmetic(input),
    ...checkLifecycle(input),
    ...checkDuplicates(input),
    ...checkCapacity(input),
    ...checkSkills(input),
    ...checkWorkload(input),
    ...checkAvailability(input),
    ...checkPrerequisites(input),
    ...checkRooms(input),
    ...checkForecast(input),
    ...checkUnmet(input),
    ...checkDecisions(input),
  ];

  const anomaliesByRule = new Map<string, GroundTruthAnomaly[]>();
  for (const anomaly of input.groundTruthAnomalies) {
    const bucket = anomaliesByRule.get(anomaly.expected_rule) ?? [];
    bucket.push(anomaly);
    anomaliesByRule.set(anomaly.expected_rule, bucket);
  }

  const detected = new Set<string>();
  const violations: ValidationViolation[] = rawViolations.map((raw) => {
    const candidates = anomaliesByRule.get(raw.check_id) ?? [];
    const match = candidates.find(
      (anomaly) =>
        anomaly.entity_id === raw.entity_id ||
        anomaly.related_entity_id === raw.entity_id,
    );
    if (match) {
      detected.add(match._id);
      return {
        ...raw,
        expected: true,
        anomaly_id: match._id,
      };
    }
    return {
      ...raw,
      expected: false,
      anomaly_id: null,
    };
  });

  const checks: ValidationCheckSummary[] = CHECK_DEFINITIONS.map((definition) => {
    const checkViolations = violations.filter(
      (candidate) => candidate.check_id === definition.id,
    );
    const unexpected = checkViolations.filter(
      (candidate) => !candidate.expected,
    ).length;
    const expected = checkViolations.length - unexpected;
    const status: ValidationStatus = unexpected === 0 ? 'PASS' : 'FAIL';
    return {
      check_id: definition.id,
      name: definition.name,
      status,
      violations: checkViolations.length,
      expected,
      unexpected,
    };
  });

  const expectedViolations = violations.filter(
    (candidate) => candidate.expected,
  ).length;
  const unexpectedViolations = violations.length - expectedViolations;
  const anomaliesExpected = input.groundTruthAnomalies.length;
  const anomaliesDetected = detected.size;
  const anomaliesMissed = Math.max(0, anomaliesExpected - anomaliesDetected);
  const detectionRate =
    anomaliesExpected > 0
      ? round2((anomaliesDetected / anomaliesExpected) * 100)
      : 0;
  const status: ValidationStatus =
    unexpectedViolations === 0 && anomaliesMissed === 0 ? 'PASS' : 'FAIL';

  const summary: ValidationSummary = {
    status,
    total_checks: CHECK_DEFINITIONS.length,
    checks,
    total_violations: violations.length,
    expected_violations: expectedViolations,
    unexpected_violations: unexpectedViolations,
    anomalies_expected: anomaliesExpected,
    anomalies_detected: anomaliesDetected,
    anomalies_missed: anomaliesMissed,
    detection_rate: detectionRate,
  };

  return { summary, violations };
}

export function issueTypeCoverage(
  anomalies: readonly GroundTruthAnomaly[],
): Record<IssueType, number> {
  const coverage = {
    FACULTY_OUTSIDE_SKILL: 0,
    WORKLOAD_EXCEEDED: 0,
    SECTION_CAPACITY_TOO_LOW: 0,
    COURSE_SCHEDULED_BEFORE_PREREQUISITE: 0,
    DUPLICATE_SECTION_ASSIGNMENT: 0,
  } satisfies Record<IssueType, number>;
  for (const anomaly of anomalies) {
    coverage[anomaly.issue_type] += 1;
  }
  return coverage;
}

export async function persistValidationRun(
  input: ValidationInput,
  output: ValidationOutput,
): Promise<string> {
  const existing = await ValidationRunModel.countDocuments({}).exec();
  const id = makeId(ID_PREFIXES.validationRun, existing + 1);
  await insertBatched(ValidationRunModel, [
    {
      _id: id,
      run_id: id,
      scale: input.scale,
      seed: input.seed,
      as_of: input.asOf,
      status: output.summary.status,
      summary: output.summary,
      violations: output.violations,
      created_at: input.asOf,
    },
  ]);
  return id;
}

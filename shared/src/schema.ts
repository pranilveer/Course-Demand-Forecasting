import {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  AVAILABILITY_TYPES,
  COLLECTION_NAMES,
  CONFIDENCE_LEVELS,
  COURSE_STATUSES,
  COURSE_TYPES,
  DAYS_OF_WEEK,
  DECISION_TYPES,
  DEGREE_LEVELS,
  DELIVERY_MODES,
  DEPARTMENTS,
  EMPLOYMENT_TYPES,
  ENTITY_TYPES,
  EVENT_TYPES,
  FACULTY_STATUSES,
  INTEREST_SOURCES,
  INTEREST_STATUSES,
  ISSUE_TYPES,
  PIPELINE_STATUSES,
  PROFICIENCIES,
  PROGRAM_STATUSES,
  ROOM_STATUSES,
  ROOM_TYPES,
  SECTION_STATUSES,
  SEVERITIES,
  STUDENT_PLAN_STATUSES,
  STUDENT_STATUSES,
  TERM_OFFERINGS,
  UNMET_REASONS,
  VALIDATION_STATUSES,
  ACTORS,
  type CollectionName,
} from './constants.js';

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'datetime' | 'json';

export interface FieldMeta {
  name: string;
  type: FieldType;
  required: boolean;
  enum?: readonly string[];
  unique?: boolean;
  fk?: CollectionName;
  unit?: string;
  description: string;
  validation?: string;
}

export interface LifecycleMeta {
  statusField: string;
  states: readonly string[];
  transitions: Record<string, readonly string[]>;
}

export interface CollectionMeta {
  name: CollectionName;
  description: string;
  fields: FieldMeta[];
  primaryKey: string;
  indexes: string[][];
  uniqueIndexes?: string[][];
  lifecycle?: LifecycleMeta;
}

const f = (
  name: string,
  type: FieldType,
  required: boolean,
  description: string,
  extra: Partial<FieldMeta> = {},
): FieldMeta => ({ name, type, required, description, ...extra });

const id = (description = 'Business primary key'): FieldMeta =>
  f('_id', 'string', true, description, { unique: true });

const createdAt = (): FieldMeta => f('created_at', 'datetime', true, 'Deterministic creation timestamp');

export const SCHEMA: Record<CollectionName, CollectionMeta> = {
  terms: {
    name: 'terms',
    description: 'Academic terms used for history, planning, and the target forecast window.',
    primaryKey: '_id',
    indexes: [],
    lifecycle: {
      statusField: 'status',
      states: ['Planned', 'Active', 'Closed'],
      transitions: {
        null: ['Planned', 'Active', 'Closed'],
        Planned: ['Active', 'Closed'],
        Active: ['Closed'],
        Closed: [],
      },
    },
    fields: [
      id('Term code such as 2026-Fall'),
      f('academic_year', 'integer', true, 'Calendar year of the term'),
      f('term_name', 'string', true, 'Term season', { enum: ['Fall', 'Spring', 'Summer'] }),
      f('start_date', 'date', true, 'First day of the term'),
      f('end_date', 'date', true, 'Last day of the term'),
      f('is_target', 'boolean', true, 'True only for the forecast target term'),
      f('status', 'string', true, 'Term lifecycle status', { enum: ['Planned', 'Active', 'Closed'] }),
      createdAt(),
    ],
  },
  programs: {
    name: 'programs',
    description: 'Degree and certificate programs offered by the institution.',
    primaryKey: '_id',
    indexes: [['department']],
    lifecycle: {
      statusField: 'status',
      states: PROGRAM_STATUSES,
      transitions: { null: ['Active', 'Inactive'], Active: ['Inactive'], Inactive: [] },
    },
    fields: [
      id('Program identifier PRG-000001'),
      f('program_code', 'string', true, 'Human-readable program code', { unique: true }),
      f('program_name', 'string', true, 'Program display name'),
      f('department', 'string', true, 'Owning department', { enum: DEPARTMENTS }),
      f('degree_level', 'string', true, 'Award level', { enum: DEGREE_LEVELS }),
      f('duration_terms', 'integer', true, 'Nominal duration in terms', { unit: 'terms' }),
      f('total_credits_required', 'integer', true, 'Credits required to graduate', { unit: 'credits' }),
      f('status', 'string', true, 'Program lifecycle status', { enum: PROGRAM_STATUSES }),
      f('effective_start_date', 'date', true, 'Date the program becomes effective'),
      f('effective_end_date', 'date', false, 'Date the program stops being effective'),
      createdAt(),
    ],
  },
  courses: {
    name: 'courses',
    description: 'Course catalog records linked to a home program.',
    primaryKey: '_id',
    indexes: [['program_id'], ['course_level'], ['course_type']],
    lifecycle: {
      statusField: 'status',
      states: COURSE_STATUSES,
      transitions: { null: ['Active', 'Inactive'], Active: ['Inactive'], Inactive: [] },
    },
    fields: [
      id('Course identifier CRS-000001'),
      f('program_id', 'string', true, 'Home program', { fk: 'programs' }),
      f('course_code', 'string', true, 'Unique catalog code', { unique: true }),
      f('title', 'string', true, 'Course title'),
      f('credits', 'integer', true, 'Academic credits', { unit: 'credits' }),
      f('contact_hours', 'number', true, 'Weekly contact hours', { unit: 'hours/week' }),
      f('course_level', 'integer', true, 'Course level 100-500', { unit: 'level' }),
      f('course_type', 'string', true, 'Course category', { enum: COURSE_TYPES }),
      f('term_offered', 'string', true, 'Terms when the course is offered', { enum: TERM_OFFERINGS }),
      f('max_section_size', 'integer', true, 'Target maximum section size', { unit: 'students' }),
      f('status', 'string', true, 'Course lifecycle status', { enum: COURSE_STATUSES }),
      f('effective_start_date', 'date', true, 'Date the course becomes effective'),
      f('effective_end_date', 'date', false, 'Date the course stops being effective'),
      createdAt(),
    ],
  },
  prerequisites: {
    name: 'prerequisites',
    description: 'Self-referential many-to-many prerequisite rules between courses.',
    primaryKey: '_id',
    indexes: [['course_id'], ['prerequisite_course_id']],
    uniqueIndexes: [['course_id', 'prerequisite_course_id']],
    fields: [
      id('Prerequisite rule identifier PRQ-000001'),
      f('course_id', 'string', true, 'Dependent course', { fk: 'courses' }),
      f('prerequisite_course_id', 'string', true, 'Required prior course', { fk: 'courses' }),
      f('min_grade', 'string', true, 'Minimum passing grade'),
      f('is_strict', 'boolean', true, 'Whether the prerequisite is enforced'),
      f('effective_start_date', 'date', true, 'Rule effective start date'),
      f('effective_end_date', 'date', false, 'Rule effective end date'),
      createdAt(),
    ],
  },
  students: {
    name: 'students',
    description: 'Synthetic learners used as parents for plans and registration interest.',
    primaryKey: '_id',
    indexes: [['program_id'], ['status']],
    lifecycle: {
      statusField: 'status',
      states: STUDENT_STATUSES,
      transitions: {
        null: ['Active', 'Graduated', 'Withdrawn'],
        Active: ['Graduated', 'Withdrawn'],
        Graduated: [],
        Withdrawn: [],
      },
    },
    fields: [
      id('Student identifier STU-000001'),
      f('program_id', 'string', true, 'Student home program', { fk: 'programs' }),
      f('cohort_year', 'integer', true, 'Entry cohort year'),
      f('entry_term', 'string', true, 'Term of entry'),
      f('status', 'string', true, 'Student lifecycle status', { enum: STUDENT_STATUSES }),
      createdAt(),
    ],
  },
  studentPlans: {
    name: 'studentPlans',
    description: 'Advisory course plans across terms, used for prerequisite sequencing checks.',
    primaryKey: '_id',
    indexes: [['student_id'], ['course_id'], ['term'], ['student_id', 'term']],
    uniqueIndexes: [['student_id', 'course_id', 'term']],
    lifecycle: {
      statusField: 'status',
      states: STUDENT_PLAN_STATUSES,
      transitions: {
        null: ['Planned', 'Registered', 'Completed', 'Dropped'],
        Planned: ['Registered', 'Dropped'],
        Registered: ['Completed', 'Dropped'],
        Completed: [],
        Dropped: [],
      },
    },
    fields: [
      id('Student plan identifier STP-000001'),
      f('student_id', 'string', true, 'Planned student', { fk: 'students' }),
      f('program_id', 'string', true, 'Program at plan time', { fk: 'programs' }),
      f('course_id', 'string', true, 'Planned course', { fk: 'courses' }),
      f('term', 'string', true, 'Planned term'),
      f('plan_sequence', 'integer', true, 'Order within the student term plan'),
      f('planned_credits', 'integer', true, 'Derived course credits', { unit: 'credits' }),
      f('status', 'string', true, 'Plan lifecycle status', { enum: STUDENT_PLAN_STATUSES }),
      createdAt(),
    ],
  },
  registrationInterests: {
    name: 'registrationInterests',
    description: 'Demand events expressing student interest or registration in a course term.',
    primaryKey: '_id',
    indexes: [['student_id'], ['course_id'], ['term'], ['course_id', 'term']],
    uniqueIndexes: [['student_id', 'course_id', 'term']],
    lifecycle: {
      statusField: 'interest_status',
      states: INTEREST_STATUSES,
      transitions: {
        null: ['Interested', 'Registered', 'Waitlisted', 'Cancelled'],
        Interested: ['Registered', 'Waitlisted', 'Cancelled'],
        Waitlisted: ['Registered', 'Cancelled'],
        Registered: [],
        Cancelled: [],
      },
    },
    fields: [
      id('Interest identifier REG-000001'),
      f('student_id', 'string', true, 'Interested student', { fk: 'students' }),
      f('course_id', 'string', true, 'Requested course', { fk: 'courses' }),
      f('term', 'string', true, 'Requested term'),
      f('priority', 'integer', true, 'Student priority 1-5', { unit: 'priority' }),
      f('interest_status', 'string', true, 'Interest lifecycle status', { enum: INTEREST_STATUSES }),
      f('source', 'string', true, 'Origin of the interest event', { enum: INTEREST_SOURCES }),
      f('expressed_at', 'datetime', true, 'When the interest was expressed'),
      createdAt(),
    ],
  },
  faculty: {
    name: 'faculty',
    description: 'Instructors with workload limits, department, and employment status.',
    primaryKey: '_id',
    indexes: [['department'], ['status'], ['employment_type']],
    lifecycle: {
      statusField: 'status',
      states: FACULTY_STATUSES,
      transitions: {
        null: ['Active', 'OnLeave', 'Inactive'],
        Active: ['OnLeave', 'Inactive'],
        OnLeave: ['Active', 'Inactive'],
        Inactive: [],
      },
    },
    fields: [
      id('Faculty identifier FAC-000001'),
      f('display_name', 'string', true, 'Synthetic display name'),
      f('email', 'string', true, 'Synthetic institutional email', { unique: true }),
      f('department', 'string', true, 'Faculty department', { enum: DEPARTMENTS }),
      f('employment_type', 'string', true, 'Employment category', { enum: EMPLOYMENT_TYPES }),
      f('max_workload_units', 'integer', true, 'Maximum workload units per term', { unit: 'units' }),
      f('min_workload_units', 'integer', true, 'Minimum target workload units', { unit: 'units' }),
      f('hire_date', 'date', true, 'Hire date'),
      f('status', 'string', true, 'Faculty lifecycle status', { enum: FACULTY_STATUSES }),
      createdAt(),
    ],
  },
  facultySkills: {
    name: 'facultySkills',
    description: 'Many-to-many bridge between faculty and courses they are qualified to teach.',
    primaryKey: '_id',
    indexes: [['faculty_id'], ['course_id']],
    uniqueIndexes: [['faculty_id', 'course_id']],
    fields: [
      id('Skill identifier FSK-000001'),
      f('faculty_id', 'string', true, 'Qualified faculty', { fk: 'faculty' }),
      f('course_id', 'string', true, 'Qualified course', { fk: 'courses' }),
      f('proficiency', 'string', true, 'Skill proficiency', { enum: PROFICIENCIES }),
      f('certified_date', 'date', true, 'Date the skill was certified'),
      f('expires_date', 'date', false, 'Optional skill expiry date'),
      createdAt(),
    ],
  },
  availabilities: {
    name: 'availabilities',
    description: 'Faculty availability windows, leave, and unavailability per term.',
    primaryKey: '_id',
    indexes: [['faculty_id'], ['term'], ['faculty_id', 'term']],
    uniqueIndexes: [['faculty_id', 'term', 'day_of_week', 'start_time']],
    fields: [
      id('Availability identifier AVL-000001'),
      f('faculty_id', 'string', true, 'Faculty member', { fk: 'faculty' }),
      f('term', 'string', true, 'Term of the availability'),
      f('day_of_week', 'string', true, 'Weekday', { enum: DAYS_OF_WEEK }),
      f('start_time', 'string', true, 'Window start HH:MM'),
      f('end_time', 'string', true, 'Window end HH:MM'),
      f('availability_type', 'string', true, 'Availability state', { enum: AVAILABILITY_TYPES }),
      f('max_sessions', 'integer', false, 'Optional maximum sessions in the window', { unit: 'sessions' }),
      createdAt(),
    ],
  },
  rooms: {
    name: 'rooms',
    description: 'Physical and computer lab rooms with capacity and type constraints.',
    primaryKey: '_id',
    indexes: [['building'], ['room_type'], ['status']],
    uniqueIndexes: [['building', 'room_number']],
    lifecycle: {
      statusField: 'status',
      states: ROOM_STATUSES,
      transitions: { null: ['Available', 'Maintenance', 'Inactive'], Available: ['Maintenance', 'Inactive'], Maintenance: ['Available', 'Inactive'], Inactive: [] },
    },
    fields: [
      id('Room identifier ROM-000001'),
      f('building', 'string', true, 'Building code'),
      f('room_number', 'string', true, 'Room number within the building'),
      f('capacity', 'integer', true, 'Room capacity', { unit: 'students' }),
      f('room_type', 'string', true, 'Room type', { enum: ROOM_TYPES }),
      f('has_projector', 'boolean', true, 'Projector availability'),
      f('accessibility', 'boolean', true, 'Accessibility features present'),
      f('status', 'string', true, 'Room lifecycle status', { enum: ROOM_STATUSES }),
      f('effective_start_date', 'date', true, 'Room effective start date'),
      f('effective_end_date', 'date', false, 'Room effective end date'),
      createdAt(),
    ],
  },
  sections: {
    name: 'sections',
    description: 'Proposed or open course sections with schedule, room, and capacity.',
    primaryKey: '_id',
    indexes: [['course_id'], ['term'], ['room_id'], ['course_id', 'term'], ['course_id', 'term', 'section_no']],
    lifecycle: {
      statusField: 'status',
      states: SECTION_STATUSES,
      transitions: {
        null: ['Draft'],
        Draft: ['Proposed', 'Cancelled'],
        Proposed: ['Open', 'Cancelled'],
        Open: ['Closed', 'Cancelled'],
        Closed: [],
        Cancelled: [],
      },
    },
    fields: [
      id('Section identifier SEC-2026-000001'),
      f('course_id', 'string', true, 'Course offered', { fk: 'courses' }),
      f('term', 'string', true, 'Section term'),
      f('section_no', 'integer', true, 'Section number within the course term'),
      f('room_id', 'string', false, 'Assigned room', { fk: 'rooms' }),
      f('capacity', 'integer', true, 'Section capacity', { unit: 'students' }),
      f('enrolled_count', 'integer', true, 'Derived enrolled count', { unit: 'students' }),
      f('schedule_day', 'string', true, 'Scheduled weekday', { enum: DAYS_OF_WEEK }),
      f('start_time', 'string', true, 'Section start HH:MM'),
      f('end_time', 'string', true, 'Section end HH:MM'),
      f('delivery_mode', 'string', true, 'Delivery mode', { enum: DELIVERY_MODES }),
      f('status', 'string', true, 'Section lifecycle status', { enum: SECTION_STATUSES }),
      createdAt(),
    ],
  },
  workloadAssignments: {
    name: 'workloadAssignments',
    description: 'Many-to-many bridge between faculty and sections, carrying workload units.',
    primaryKey: '_id',
    indexes: [['faculty_id'], ['section_id'], ['term'], ['faculty_id', 'term']],
    lifecycle: {
      statusField: 'status',
      states: ASSIGNMENT_STATUSES,
      transitions: {
        null: ['Proposed'],
        Proposed: ['Confirmed', 'Cancelled'],
        Confirmed: ['Cancelled'],
        Cancelled: [],
      },
    },
    fields: [
      id('Assignment identifier WLA-2026-000001'),
      f('faculty_id', 'string', true, 'Assigned faculty', { fk: 'faculty' }),
      f('section_id', 'string', true, 'Assigned section', { fk: 'sections' }),
      f('term', 'string', true, 'Assignment term'),
      f('workload_units', 'number', true, 'Derived workload units', { unit: 'units' }),
      f('assignment_role', 'string', true, 'Role in the section', { enum: ASSIGNMENT_ROLES }),
      f('assigned_date', 'date', true, 'Assignment date'),
      f('status', 'string', true, 'Assignment lifecycle status', { enum: ASSIGNMENT_STATUSES }),
      createdAt(),
    ],
  },
  demandForecasts: {
    name: 'demandForecasts',
    description: 'Derived demand forecasts with historical inputs and method provenance.',
    primaryKey: '_id',
    indexes: [['course_id'], ['term'], ['confidence']],
    uniqueIndexes: [['course_id', 'term', 'method']],
    fields: [
      id('Forecast identifier FCT-2026-000001'),
      f('course_id', 'string', true, 'Forecasted course', { fk: 'courses' }),
      f('term', 'string', true, 'Target term'),
      f('history_term_1', 'string', true, 'Most recent history term'),
      f('history_term_2', 'string', true, 'Second history term'),
      f('history_term_3', 'string', true, 'Third history term'),
      f('hist_demand_1', 'integer', true, 'Demand in history term 1', { unit: 'students' }),
      f('hist_demand_2', 'integer', true, 'Demand in history term 2', { unit: 'students' }),
      f('hist_demand_3', 'integer', true, 'Demand in history term 3', { unit: 'students' }),
      f('weighted_average', 'number', true, 'Weighted moving average'),
      f('trend_adjustment', 'number', true, 'Trend adjustment applied'),
      f('forecast_enrollment', 'integer', true, 'Final forecast', { unit: 'students' }),
      f('confidence', 'string', true, 'Forecast confidence', { enum: CONFIDENCE_LEVELS }),
      f('method', 'string', true, 'Forecast method identifier'),
      f('computed_at', 'datetime', true, 'Deterministic computation timestamp'),
    ],
  },
  unmetDemands: {
    name: 'unmetDemands',
    description: 'Visible demand that could not be served, with a primary reason code.',
    primaryKey: '_id',
    indexes: [['course_id'], ['term'], ['reason_code']],
    fields: [
      id('Unmet demand identifier UND-2026-000001'),
      f('course_id', 'string', true, 'Course with unmet demand', { fk: 'courses' }),
      f('term', 'string', true, 'Target term'),
      f('forecast_enrollment', 'integer', true, 'Forecast demand', { unit: 'students' }),
      f('allocated_capacity', 'integer', true, 'Effective allocated capacity', { unit: 'students' }),
      f('unmet_count', 'integer', true, 'Forecast minus effective capacity', { unit: 'students' }),
      f('reason_code', 'string', true, 'Primary unmet reason', { enum: UNMET_REASONS }),
      f('details', 'json', true, 'Structured explanation of the shortfall'),
      createdAt(),
    ],
  },
  allocationDecisions: {
    name: 'allocationDecisions',
    description: 'Explainable allocation decisions with candidate snapshots and rationale.',
    primaryKey: '_id',
    indexes: [['section_id'], ['course_id'], ['faculty_id'], ['term']],
    fields: [
      id('Decision identifier DEC-2026-000001'),
      f('section_id', 'string', false, 'Section the decision applies to', { fk: 'sections' }),
      f('course_id', 'string', true, 'Course the decision applies to', { fk: 'courses' }),
      f('faculty_id', 'string', false, 'Chosen faculty', { fk: 'faculty' }),
      f('room_id', 'string', false, 'Chosen room', { fk: 'rooms' }),
      f('term', 'string', true, 'Decision term'),
      f('decision_type', 'string', true, 'Decision category', { enum: DECISION_TYPES }),
      f('score', 'number', true, 'Chosen candidate score'),
      f('candidate_snapshot', 'json', true, 'Top candidates and rejection context'),
      f('rationale', 'string', true, 'Human-readable explanation'),
      createdAt(),
    ],
  },
  lifecycleEvents: {
    name: 'lifecycleEvents',
    description: 'Append-only lifecycle history for state-bearing entities.',
    primaryKey: '_id',
    indexes: [['entity_type', 'entity_id'], ['event_ts'], ['event_type']],
    fields: [
      id('Event identifier EVT-000001'),
      f('entity_type', 'string', true, 'Entity type', { enum: ENTITY_TYPES }),
      f('entity_id', 'string', true, 'Entity business ID'),
      f('from_state', 'string', false, 'Previous state, null on creation'),
      f('to_state', 'string', true, 'New state'),
      f('event_type', 'string', true, 'Event category', { enum: EVENT_TYPES }),
      f('event_ts', 'datetime', true, 'Deterministic event timestamp'),
      f('actor', 'string', true, 'Actor that caused the event', { enum: ACTORS }),
      f('reason', 'string', true, 'Reason for the event'),
      createdAt(),
    ],
  },
  groundTruthAnomalies: {
    name: 'groundTruthAnomalies',
    description: 'Evaluation-only labels for deliberately injected anomalies. Never used as model input.',
    primaryKey: '_id',
    indexes: [['issue_type'], ['entity_type', 'entity_id']],
    fields: [
      id('Anomaly identifier ANM-000001'),
      f('issue_type', 'string', true, 'Known anomaly type', { enum: ISSUE_TYPES }),
      f('entity_type', 'string', true, 'Entity type', { enum: ENTITY_TYPES }),
      f('entity_id', 'string', true, 'Anomalous entity ID'),
      f('related_entity_id', 'string', false, 'Related entity ID'),
      f('expected_rule', 'string', true, 'Validation rule expected to detect the anomaly'),
      f('expected_action', 'string', true, 'Expected remediation'),
      f('severity', 'string', true, 'Severity label', { enum: SEVERITIES }),
      f('injected', 'boolean', true, 'True for deliberately injected anomalies'),
      f('notes', 'string', true, 'Injection notes'),
      createdAt(),
    ],
  },
  validationRuns: {
    name: 'validationRuns',
    description: 'Validation summaries and violation details for a pipeline run.',
    primaryKey: '_id',
    indexes: [['run_id'], ['status'], ['created_at']],
    fields: [
      id('Validation run identifier VAL-000001'),
      f('run_id', 'string', true, 'Pipeline run identifier'),
      f('scale', 'string', true, 'Dataset scale'),
      f('seed', 'integer', true, 'Random seed'),
      f('as_of', 'datetime', true, 'Deterministic as-of timestamp'),
      f('status', 'string', true, 'Validation gate status', { enum: VALIDATION_STATUSES }),
      f('summary', 'json', true, 'Validation summary'),
      f('violations', 'json', true, 'Validation violation details'),
      createdAt(),
    ],
  },
  pipelineRuns: {
    name: 'pipelineRuns',
    description: 'Pipeline execution metadata, row counts, and checksums.',
    primaryKey: '_id',
    indexes: [['scale'], ['seed'], ['status']],
    fields: [
      id('Pipeline run identifier RUN-000001'),
      f('scale', 'string', true, 'Dataset scale'),
      f('seed', 'integer', true, 'Random seed'),
      f('as_of', 'datetime', true, 'Deterministic as-of timestamp'),
      f('db_name', 'string', true, 'MongoDB database name'),
      f('status', 'string', true, 'Pipeline status', { enum: PIPELINE_STATUSES }),
      f('counts', 'json', true, 'Row counts by collection'),
      f('checksums', 'json', true, 'Artifact checksums'),
      f('started_at', 'datetime', true, 'Deterministic start timestamp'),
      f('completed_at', 'datetime', false, 'Deterministic completion timestamp'),
    ],
  },
};

export const COLLECTION_META_LIST = COLLECTION_NAMES.map((name) => SCHEMA[name]);

export function fieldNames(collection: CollectionName): string[] {
  return SCHEMA[collection].fields.map((field) => field.name);
}

export function enumFields(collection: CollectionName): FieldMeta[] {
  return SCHEMA[collection].fields.filter((field) => Array.isArray(field.enum));
}

export function foreignKeys(collection: CollectionName): FieldMeta[] {
  return SCHEMA[collection].fields.filter((field) => field.fk !== undefined);
}

export const SEED = 20261022;
export const AS_OF = '2026-08-01T00:00:00.000Z';
export const AS_OF_DATE = '2026-08-01';

export const HISTORY_TERMS = ['2023-Fall', '2024-Fall', '2025-Fall'] as const;
export const TARGET_TERM = '2026-Fall';
export const PLAN_TERMS = ['2025-Fall', '2026-Spring', '2026-Fall'] as const;
export const TERM_CODES = ['2023-Fall', '2024-Fall', '2025-Fall', '2026-Spring', '2026-Fall'] as const;
export const INTEREST_TERMS = [...HISTORY_TERMS, TARGET_TERM] as const;

export type HistoryTerm = (typeof HISTORY_TERMS)[number];
export type PlanTerm = (typeof PLAN_TERMS)[number];
export type TermCode = (typeof TERM_CODES)[number];
export type InterestTerm = (typeof INTEREST_TERMS)[number];

export const TERM_DATES: Record<
  TermCode,
  { start: string; end: string; academicYear: number; name: 'Fall' | 'Spring' | 'Summer' }
> = {
  '2023-Fall': { start: '2023-08-21', end: '2023-12-15', academicYear: 2023, name: 'Fall' },
  '2024-Fall': { start: '2024-08-19', end: '2024-12-13', academicYear: 2024, name: 'Fall' },
  '2025-Fall': { start: '2025-08-18', end: '2025-12-12', academicYear: 2025, name: 'Fall' },
  '2026-Spring': { start: '2026-01-12', end: '2026-05-08', academicYear: 2026, name: 'Spring' },
  '2026-Fall': { start: '2026-08-17', end: '2026-12-11', academicYear: 2026, name: 'Fall' },
};

export const DEPARTMENTS = [
  'Computer Science',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Business',
  'Mathematics',
  'Physics',
  'Biology',
  'Psychology',
  'Design',
  'Economics',
] as const;

export const DEGREE_LEVELS = ['Certificate', 'Diploma', 'Bachelor', 'Master'] as const;
export const PROGRAM_STATUSES = ['Active', 'Inactive'] as const;
export const COURSE_TYPES = ['Core', 'Elective', 'Lab', 'Seminar'] as const;
export const TERM_OFFERINGS = ['Fall', 'Spring', 'Summer', 'Both'] as const;
export const COURSE_STATUSES = ['Active', 'Inactive'] as const;
export const STUDENT_STATUSES = ['Active', 'Graduated', 'Withdrawn'] as const;
export const STUDENT_PLAN_STATUSES = ['Planned', 'Registered', 'Completed', 'Dropped'] as const;
export const INTEREST_STATUSES = ['Interested', 'Registered', 'Waitlisted', 'Cancelled'] as const;
export const INTEREST_SOURCES = ['Plan', 'SelfService', 'Advisor', 'Waitlist'] as const;
export const EMPLOYMENT_TYPES = ['FullTime', 'PartTime', 'Adjunct'] as const;
export const FACULTY_STATUSES = ['Active', 'OnLeave', 'Inactive'] as const;
export const PROFICIENCIES = ['Primary', 'Secondary', 'Trained'] as const;
export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const AVAILABILITY_TYPES = ['Available', 'Leave', 'Unavailable'] as const;
export const ROOM_TYPES = ['Lecture', 'Lab', 'ComputerLab', 'Seminar'] as const;
export const ROOM_STATUSES = ['Available', 'Maintenance', 'Inactive'] as const;
export const SECTION_STATUSES = ['Draft', 'Proposed', 'Open', 'Closed', 'Cancelled'] as const;
export const DELIVERY_MODES = ['InPerson', 'Online', 'Hybrid'] as const;
export const ASSIGNMENT_ROLES = ['Instructor', 'CoInstructor', 'Substitute'] as const;
export const ASSIGNMENT_STATUSES = ['Proposed', 'Confirmed', 'Cancelled'] as const;
export const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low'] as const;
export const UNMET_REASONS = [
  'NO_QUALIFIED_FACULTY',
  'NO_ROOM',
  'WORKLOAD_LIMIT',
  'CAPACITY_SHORTFALL',
] as const;
export const DECISION_TYPES = [
  'SectionProposal',
  'FacultyAssignment',
  'RoomAssignment',
  'UnmetDemand',
] as const;
export const ENTITY_TYPES = [
  'Term',
  'Program',
  'Course',
  'Prerequisite',
  'Student',
  'StudentPlan',
  'RegistrationInterest',
  'Faculty',
  'FacultySkill',
  'Availability',
  'Room',
  'Section',
  'WorkloadAssignment',
  'DemandForecast',
  'UnmetDemand',
  'AllocationDecision',
] as const;
export const EVENT_TYPES = ['Created', 'StatusChanged', 'Assigned', 'Unassigned', 'Cancelled'] as const;
export const ACTORS = ['Generator', 'Allocator', 'Administrator', 'System'] as const;
export const ISSUE_TYPES = [
  'FACULTY_OUTSIDE_SKILL',
  'WORKLOAD_EXCEEDED',
  'SECTION_CAPACITY_TOO_LOW',
  'COURSE_SCHEDULED_BEFORE_PREREQUISITE',
  'DUPLICATE_SECTION_ASSIGNMENT',
] as const;
export const SEVERITIES = ['High', 'Medium', 'Low'] as const;
export const VALIDATION_STATUSES = ['PASS', 'FAIL'] as const;
export const PIPELINE_STATUSES = ['Running', 'Completed', 'Failed'] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export type CourseType = (typeof COURSE_TYPES)[number];
export type TermOffering = (typeof TERM_OFFERINGS)[number];
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export type StudentPlanStatus = (typeof STUDENT_PLAN_STATUSES)[number];
export type InterestStatus = (typeof INTEREST_STATUSES)[number];
export type InterestSource = (typeof INTEREST_SOURCES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type FacultyStatus = (typeof FACULTY_STATUSES)[number];
export type Proficiency = (typeof PROFICIENCIES)[number];
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
export type AvailabilityType = (typeof AVAILABILITY_TYPES)[number];
export type RoomType = (typeof ROOM_TYPES)[number];
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export type SectionStatus = (typeof SECTION_STATUSES)[number];
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type UnmetReason = (typeof UNMET_REASONS)[number];
export type DecisionType = (typeof DECISION_TYPES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type Actor = (typeof ACTORS)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const COLLECTION_NAMES = [
  'terms',
  'programs',
  'courses',
  'prerequisites',
  'students',
  'studentPlans',
  'registrationInterests',
  'faculty',
  'facultySkills',
  'availabilities',
  'rooms',
  'sections',
  'workloadAssignments',
  'demandForecasts',
  'unmetDemands',
  'allocationDecisions',
  'lifecycleEvents',
  'groundTruthAnomalies',
  'validationRuns',
  'pipelineRuns',
] as const;

export type CollectionName = (typeof COLLECTION_NAMES)[number];

export const TIME_SLOTS = [
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '13:00', end: '15:00' },
  { start: '15:00', end: '17:00' },
] as const;

export const MIN_SECTION_SIZE = 8;
export const MAX_SECTIONS_PER_COURSE = 8;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export const SCALES = {
  starter: {
    programs: 10,
    courses: 100,
    faculty: 50,
    students: 500,
    studentPlans: 2000,
    rooms: 20,
    anomalyPerType: 1,
  },
  full: {
    programs: 100,
    courses: 1000,
    faculty: 500,
    students: 5000,
    studentPlans: 20000,
    rooms: 150,
    anomalyPerType: 5,
  },
} as const;

export type ScaleName = keyof typeof SCALES;

export const RULE_IDS = {
  PK: 'VAL-PK-01',
  FK: 'VAL-FK-01',
  ENUM: 'VAL-ENUM-01',
  DATE: 'VAL-DATE-01',
  ARITH: 'VAL-ARITH-01',
  LIFE: 'VAL-LIFE-01',
  DUP: 'VAL-DUP-01',
  CAP: 'VAL-CAP-01',
  SKILL: 'VAL-SKILL-01',
  WORKLOAD: 'VAL-WORKLOAD-01',
  AVAIL: 'VAL-AVAIL-01',
  PREREQ: 'VAL-PREREQ-01',
  ROOM: 'VAL-ROOM-01',
  FORECAST: 'VAL-FORECAST-01',
  UNMET: 'VAL-UNMET-01',
  DECISION: 'VAL-DECISION-01',
} as const;

export const ISSUE_RULE_MAP: Record<IssueType, string> = {
  FACULTY_OUTSIDE_SKILL: RULE_IDS.SKILL,
  WORKLOAD_EXCEEDED: RULE_IDS.WORKLOAD,
  SECTION_CAPACITY_TOO_LOW: RULE_IDS.CAP,
  COURSE_SCHEDULED_BEFORE_PREREQUISITE: RULE_IDS.PREREQ,
  DUPLICATE_SECTION_ASSIGNMENT: RULE_IDS.DUP,
};

export const PROFICIENCY_SCORE: Record<Proficiency, number> = {
  Primary: 1,
  Secondary: 0.7,
  Trained: 0.5,
};

export const TERM_DEMAND_FACTOR: Record<InterestTerm, number> = {
  '2023-Fall': 0.85,
  '2024-Fall': 0.95,
  '2025-Fall': 1.05,
  '2026-Fall': 1.1,
};

export const INTEREST_STATUS_WEIGHTS = [
  { value: 'Registered' as const, weight: 75 },
  { value: 'Waitlisted' as const, weight: 10 },
  { value: 'Interested' as const, weight: 10 },
  { value: 'Cancelled' as const, weight: 5 },
];

export const EMPLOYMENT_TYPE_WEIGHTS = [
  { value: 'FullTime' as const, weight: 70 },
  { value: 'PartTime' as const, weight: 20 },
  { value: 'Adjunct' as const, weight: 10 },
];

export const ROOM_TYPE_WEIGHTS = [
  { value: 'Lecture' as const, weight: 55 },
  { value: 'Lab' as const, weight: 25 },
  { value: 'ComputerLab' as const, weight: 10 },
  { value: 'Seminar' as const, weight: 10 },
];

export const DEGREE_LEVEL_WEIGHTS = [
  { value: 'Certificate' as const, weight: 10 },
  { value: 'Diploma' as const, weight: 15 },
  { value: 'Bachelor' as const, weight: 55 },
  { value: 'Master' as const, weight: 20 },
];

export const COURSE_TYPE_WEIGHTS = [
  { value: 'Core' as const, weight: 60 },
  { value: 'Elective' as const, weight: 30 },
  { value: 'Lab' as const, weight: 10 },
];

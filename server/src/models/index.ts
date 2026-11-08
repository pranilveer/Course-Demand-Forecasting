import mongoose, { Schema, type Model, type SchemaDefinition } from 'mongoose';
import type {
  AllocationDecision,
  Availability,
  CollectionName,
  Course,
  DemandForecast,
  Faculty,
  FacultySkill,
  GroundTruthAnomaly,
  LifecycleEvent,
  PipelineRun,
  Prerequisite,
  Program,
  RegistrationInterest,
  Room,
  Section,
  Student,
  StudentPlan,
  Term,
  UnmetDemand,
  ValidationRun,
  WorkloadAssignment,
} from '@yottaflex/shared';
import {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  AVAILABILITY_TYPES,
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
} from '@yottaflex/shared';

const baseOptions = {
  versionKey: false,
  timestamps: false,
  minimize: false,
} as const;

const en = (values: readonly string[]): string[] => [...values];

const stringField = { type: String, required: true } as const;
const nullableString = { type: String, default: null } as const;
const numberField = { type: Number, required: true } as const;
const nullableNumber = { type: Number, default: null } as const;
const booleanField = { type: Boolean, required: true } as const;
const jsonField = { type: Schema.Types.Mixed, required: true } as const;

function makeSchema<T>(collection: string, definition: SchemaDefinition): Schema<T> {
  return new Schema<T>(
    {
      _id: { type: String, required: true },
      ...definition,
    },
    { ...baseOptions, collection },
  );
}

const TermSchema = makeSchema<Term>('terms', {
  academic_year: numberField,
  term_name: { type: String, required: true, enum: ['Fall', 'Spring', 'Summer'] },
  start_date: stringField,
  end_date: stringField,
  is_target: booleanField,
  status: { type: String, required: true, enum: ['Planned', 'Active', 'Closed'] },
  created_at: stringField,
});

const ProgramSchema = makeSchema<Program>('programs', {
  program_code: { type: String, required: true, unique: true },
  program_name: stringField,
  department: { type: String, required: true, enum: en(DEPARTMENTS) },
  degree_level: { type: String, required: true, enum: en(DEGREE_LEVELS) },
  duration_terms: numberField,
  total_credits_required: numberField,
  status: { type: String, required: true, enum: en(PROGRAM_STATUSES) },
  effective_start_date: stringField,
  effective_end_date: nullableString,
  created_at: stringField,
});
ProgramSchema.index({ department: 1 });

const CourseSchema = makeSchema<Course>('courses', {
  program_id: { type: String, required: true, index: true },
  course_code: { type: String, required: true, unique: true },
  title: stringField,
  credits: numberField,
  contact_hours: numberField,
  course_level: { type: Number, required: true, index: true },
  course_type: { type: String, required: true, enum: en(COURSE_TYPES), index: true },
  term_offered: { type: String, required: true, enum: en(TERM_OFFERINGS) },
  max_section_size: numberField,
  status: { type: String, required: true, enum: en(COURSE_STATUSES) },
  effective_start_date: stringField,
  effective_end_date: nullableString,
  created_at: stringField,
});
CourseSchema.index({ program_id: 1, course_level: 1 });

const PrerequisiteSchema = makeSchema<Prerequisite>('prerequisites', {
  course_id: { type: String, required: true, index: true },
  prerequisite_course_id: { type: String, required: true, index: true },
  min_grade: stringField,
  is_strict: booleanField,
  effective_start_date: stringField,
  effective_end_date: nullableString,
  created_at: stringField,
});
PrerequisiteSchema.index({ course_id: 1, prerequisite_course_id: 1 }, { unique: true });

const StudentSchema = makeSchema<Student>('students', {
  program_id: { type: String, required: true, index: true },
  cohort_year: numberField,
  entry_term: stringField,
  status: { type: String, required: true, enum: en(STUDENT_STATUSES), index: true },
  created_at: stringField,
});

const StudentPlanSchema = makeSchema<StudentPlan>('studentPlans', {
  student_id: { type: String, required: true, index: true },
  program_id: { type: String, required: true, index: true },
  course_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  plan_sequence: numberField,
  planned_credits: numberField,
  status: { type: String, required: true, enum: en(STUDENT_PLAN_STATUSES) },
  created_at: stringField,
});
StudentPlanSchema.index({ student_id: 1, course_id: 1, term: 1 }, { unique: true });
StudentPlanSchema.index({ student_id: 1, term: 1 });

const RegistrationInterestSchema = makeSchema<RegistrationInterest>('registrationInterests', {
  student_id: { type: String, required: true, index: true },
  course_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  priority: numberField,
  interest_status: { type: String, required: true, enum: en(INTEREST_STATUSES) },
  source: { type: String, required: true, enum: en(INTEREST_SOURCES) },
  expressed_at: stringField,
  created_at: stringField,
});
RegistrationInterestSchema.index({ student_id: 1, course_id: 1, term: 1 }, { unique: true });
RegistrationInterestSchema.index({ course_id: 1, term: 1 });

const FacultySchema = makeSchema<Faculty>('faculty', {
  display_name: stringField,
  email: { type: String, required: true, unique: true },
  department: { type: String, required: true, enum: en(DEPARTMENTS), index: true },
  employment_type: { type: String, required: true, enum: en(EMPLOYMENT_TYPES), index: true },
  max_workload_units: numberField,
  min_workload_units: numberField,
  hire_date: stringField,
  status: { type: String, required: true, enum: en(FACULTY_STATUSES), index: true },
  created_at: stringField,
});

const FacultySkillSchema = makeSchema<FacultySkill>('facultySkills', {
  faculty_id: { type: String, required: true, index: true },
  course_id: { type: String, required: true, index: true },
  proficiency: { type: String, required: true, enum: en(PROFICIENCIES) },
  certified_date: stringField,
  expires_date: nullableString,
  created_at: stringField,
});
FacultySkillSchema.index({ faculty_id: 1, course_id: 1 }, { unique: true });

const AvailabilitySchema = makeSchema<Availability>('availabilities', {
  faculty_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  day_of_week: { type: String, required: true, enum: en(DAYS_OF_WEEK) },
  start_time: stringField,
  end_time: stringField,
  availability_type: { type: String, required: true, enum: en(AVAILABILITY_TYPES) },
  max_sessions: nullableNumber,
  created_at: stringField,
});
AvailabilitySchema.index(
  { faculty_id: 1, term: 1, day_of_week: 1, start_time: 1 },
  { unique: true },
);

const RoomSchema = makeSchema<Room>('rooms', {
  building: { type: String, required: true, index: true },
  room_number: stringField,
  capacity: numberField,
  room_type: { type: String, required: true, enum: en(ROOM_TYPES), index: true },
  has_projector: booleanField,
  accessibility: booleanField,
  status: { type: String, required: true, enum: en(ROOM_STATUSES), index: true },
  effective_start_date: stringField,
  effective_end_date: nullableString,
  created_at: stringField,
});
RoomSchema.index({ building: 1, room_number: 1 }, { unique: true });

const SectionSchema = makeSchema<Section>('sections', {
  course_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  section_no: numberField,
  room_id: { type: String, default: null, index: true },
  capacity: numberField,
  enrolled_count: numberField,
  schedule_day: { type: String, required: true, enum: en(DAYS_OF_WEEK) },
  start_time: stringField,
  end_time: stringField,
  delivery_mode: { type: String, required: true, enum: en(DELIVERY_MODES) },
  status: { type: String, required: true, enum: en(SECTION_STATUSES) },
  created_at: stringField,
});
SectionSchema.index({ course_id: 1, term: 1, section_no: 1 });

const WorkloadAssignmentSchema = makeSchema<WorkloadAssignment>('workloadAssignments', {
  faculty_id: { type: String, required: true, index: true },
  section_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  workload_units: numberField,
  assignment_role: { type: String, required: true, enum: en(ASSIGNMENT_ROLES) },
  assigned_date: stringField,
  status: { type: String, required: true, enum: en(ASSIGNMENT_STATUSES) },
  created_at: stringField,
});
WorkloadAssignmentSchema.index({ faculty_id: 1, term: 1 });

const DemandForecastSchema = makeSchema<DemandForecast>('demandForecasts', {
  course_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  history_term_1: stringField,
  history_term_2: stringField,
  history_term_3: stringField,
  hist_demand_1: numberField,
  hist_demand_2: numberField,
  hist_demand_3: numberField,
  weighted_average: numberField,
  trend_adjustment: numberField,
  forecast_enrollment: numberField,
  confidence: { type: String, required: true, enum: en(CONFIDENCE_LEVELS), index: true },
  method: stringField,
  computed_at: stringField,
});
DemandForecastSchema.index({ course_id: 1, term: 1, method: 1 }, { unique: true });

const UnmetDemandSchema = makeSchema<UnmetDemand>('unmetDemands', {
  course_id: { type: String, required: true, index: true },
  term: { type: String, required: true, index: true },
  forecast_enrollment: numberField,
  allocated_capacity: numberField,
  unmet_count: numberField,
  reason_code: { type: String, required: true, enum: en(UNMET_REASONS), index: true },
  details: jsonField,
  created_at: stringField,
});

const AllocationDecisionSchema = makeSchema<AllocationDecision>('allocationDecisions', {
  section_id: { type: String, default: null, index: true },
  course_id: { type: String, required: true, index: true },
  faculty_id: { type: String, default: null, index: true },
  room_id: { type: String, default: null, index: true },
  term: { type: String, required: true, index: true },
  decision_type: { type: String, required: true, enum: en(DECISION_TYPES) },
  score: numberField,
  candidate_snapshot: jsonField,
  rationale: stringField,
  created_at: stringField,
});

const LifecycleEventSchema = makeSchema<LifecycleEvent>('lifecycleEvents', {
  entity_type: { type: String, required: true, enum: en(ENTITY_TYPES) },
  entity_id: { type: String, required: true },
  from_state: nullableString,
  to_state: stringField,
  event_type: { type: String, required: true, enum: en(EVENT_TYPES) },
  event_ts: stringField,
  actor: { type: String, required: true, enum: en(ACTORS) },
  reason: stringField,
  created_at: stringField,
});
LifecycleEventSchema.index({ entity_type: 1, entity_id: 1 });
LifecycleEventSchema.index({ event_ts: 1 });
LifecycleEventSchema.index({ event_type: 1 });

const GroundTruthAnomalySchema = makeSchema<GroundTruthAnomaly>('groundTruthAnomalies', {
  issue_type: { type: String, required: true, enum: en(ISSUE_TYPES), index: true },
  entity_type: { type: String, required: true, enum: en(ENTITY_TYPES) },
  entity_id: { type: String, required: true },
  related_entity_id: nullableString,
  expected_rule: stringField,
  expected_action: stringField,
  severity: { type: String, required: true, enum: en(SEVERITIES) },
  injected: booleanField,
  notes: stringField,
  created_at: stringField,
});
GroundTruthAnomalySchema.index({ entity_type: 1, entity_id: 1 });

const ValidationRunSchema = makeSchema<ValidationRun>('validationRuns', {
  run_id: { type: String, required: true, index: true },
  scale: stringField,
  seed: numberField,
  as_of: stringField,
  status: { type: String, required: true, enum: en(VALIDATION_STATUSES), index: true },
  summary: jsonField,
  violations: jsonField,
  created_at: stringField,
});
ValidationRunSchema.index({ created_at: -1 });

const PipelineRunSchema = makeSchema<PipelineRun>('pipelineRuns', {
  scale: stringField,
  seed: numberField,
  as_of: stringField,
  db_name: stringField,
  status: { type: String, required: true, enum: en(PIPELINE_STATUSES), index: true },
  counts: jsonField,
  checksums: jsonField,
  started_at: stringField,
  completed_at: nullableString,
});
PipelineRunSchema.index({ scale: 1, seed: 1, status: 1 });

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

export const TermModel = model<Term>('Term', TermSchema);
export const ProgramModel = model<Program>('Program', ProgramSchema);
export const CourseModel = model<Course>('Course', CourseSchema);
export const PrerequisiteModel = model<Prerequisite>('Prerequisite', PrerequisiteSchema);
export const StudentModel = model<Student>('Student', StudentSchema);
export const StudentPlanModel = model<StudentPlan>('StudentPlan', StudentPlanSchema);
export const RegistrationInterestModel = model<RegistrationInterest>(
  'RegistrationInterest',
  RegistrationInterestSchema,
);
export const FacultyModel = model<Faculty>('Faculty', FacultySchema);
export const FacultySkillModel = model<FacultySkill>('FacultySkill', FacultySkillSchema);
export const AvailabilityModel = model<Availability>('Availability', AvailabilitySchema);
export const RoomModel = model<Room>('Room', RoomSchema);
export const SectionModel = model<Section>('Section', SectionSchema);
export const WorkloadAssignmentModel = model<WorkloadAssignment>(
  'WorkloadAssignment',
  WorkloadAssignmentSchema,
);
export const DemandForecastModel = model<DemandForecast>('DemandForecast', DemandForecastSchema);
export const UnmetDemandModel = model<UnmetDemand>('UnmetDemand', UnmetDemandSchema);
export const AllocationDecisionModel = model<AllocationDecision>(
  'AllocationDecision',
  AllocationDecisionSchema,
);
export const LifecycleEventModel = model<LifecycleEvent>('LifecycleEvent', LifecycleEventSchema);
export const GroundTruthAnomalyModel = model<GroundTruthAnomaly>(
  'GroundTruthAnomaly',
  GroundTruthAnomalySchema,
);
export const ValidationRunModel = model<ValidationRun>('ValidationRun', ValidationRunSchema);
export const PipelineRunModel = model<PipelineRun>('PipelineRun', PipelineRunSchema);

export const models: Record<CollectionName, Model<any>> = {
  terms: TermModel,
  programs: ProgramModel,
  courses: CourseModel,
  prerequisites: PrerequisiteModel,
  students: StudentModel,
  studentPlans: StudentPlanModel,
  registrationInterests: RegistrationInterestModel,
  faculty: FacultyModel,
  facultySkills: FacultySkillModel,
  availabilities: AvailabilityModel,
  rooms: RoomModel,
  sections: SectionModel,
  workloadAssignments: WorkloadAssignmentModel,
  demandForecasts: DemandForecastModel,
  unmetDemands: UnmetDemandModel,
  allocationDecisions: AllocationDecisionModel,
  lifecycleEvents: LifecycleEventModel,
  groundTruthAnomalies: GroundTruthAnomalyModel,
  validationRuns: ValidationRunModel,
  pipelineRuns: PipelineRunModel,
};

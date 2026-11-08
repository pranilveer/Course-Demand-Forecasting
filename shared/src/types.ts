import type {
  Actor,
  AssignmentRole,
  AssignmentStatus,
  AvailabilityType,
  CollectionName,
  ConfidenceLevel,
  CourseStatus,
  CourseType,
  DayOfWeek,
  DecisionType,
  DegreeLevel,
  DeliveryMode,
  Department,
  EmploymentType,
  EntityType,
  EventType,
  FacultyStatus,
  InterestSource,
  InterestStatus,
  IssueType,
  PipelineStatus,
  Proficiency,
  ProgramStatus,
  RoomStatus,
  RoomType,
  ScaleName,
  SectionStatus,
  Severity,
  StudentPlanStatus,
  StudentStatus,
  TermCode,
  TermOffering,
  UnmetReason,
  ValidationStatus,
} from './constants.js';

export interface Term {
  _id: TermCode;
  academic_year: number;
  term_name: 'Fall' | 'Spring' | 'Summer';
  start_date: string;
  end_date: string;
  is_target: boolean;
  status: 'Planned' | 'Active' | 'Closed';
  created_at: string;
}

export interface Program {
  _id: string;
  program_code: string;
  program_name: string;
  department: Department;
  degree_level: DegreeLevel;
  duration_terms: number;
  total_credits_required: number;
  status: ProgramStatus;
  effective_start_date: string;
  effective_end_date: string | null;
  created_at: string;
}

export interface Course {
  _id: string;
  program_id: string;
  course_code: string;
  title: string;
  credits: number;
  contact_hours: number;
  course_level: number;
  course_type: CourseType;
  term_offered: TermOffering;
  max_section_size: number;
  status: CourseStatus;
  effective_start_date: string;
  effective_end_date: string | null;
  created_at: string;
}

export interface Prerequisite {
  _id: string;
  course_id: string;
  prerequisite_course_id: string;
  min_grade: string;
  is_strict: boolean;
  effective_start_date: string;
  effective_end_date: string | null;
  created_at: string;
}

export interface Student {
  _id: string;
  program_id: string;
  cohort_year: number;
  entry_term: TermCode;
  status: StudentStatus;
  created_at: string;
}

export interface StudentPlan {
  _id: string;
  student_id: string;
  program_id: string;
  course_id: string;
  term: TermCode;
  plan_sequence: number;
  planned_credits: number;
  status: StudentPlanStatus;
  created_at: string;
}

export interface RegistrationInterest {
  _id: string;
  student_id: string;
  course_id: string;
  term: TermCode;
  priority: number;
  interest_status: InterestStatus;
  source: InterestSource;
  expressed_at: string;
  created_at: string;
}

export interface Faculty {
  _id: string;
  display_name: string;
  email: string;
  department: Department;
  employment_type: EmploymentType;
  max_workload_units: number;
  min_workload_units: number;
  hire_date: string;
  status: FacultyStatus;
  created_at: string;
}

export interface FacultySkill {
  _id: string;
  faculty_id: string;
  course_id: string;
  proficiency: Proficiency;
  certified_date: string;
  expires_date: string | null;
  created_at: string;
}

export interface Availability {
  _id: string;
  faculty_id: string;
  term: TermCode;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  availability_type: AvailabilityType;
  max_sessions: number | null;
  created_at: string;
}

export interface Room {
  _id: string;
  building: string;
  room_number: string;
  capacity: number;
  room_type: RoomType;
  has_projector: boolean;
  accessibility: boolean;
  status: RoomStatus;
  effective_start_date: string;
  effective_end_date: string | null;
  created_at: string;
}

export interface Section {
  _id: string;
  course_id: string;
  term: TermCode;
  section_no: number;
  room_id: string | null;
  capacity: number;
  enrolled_count: number;
  schedule_day: DayOfWeek;
  start_time: string;
  end_time: string;
  delivery_mode: DeliveryMode;
  status: SectionStatus;
  created_at: string;
}

export interface WorkloadAssignment {
  _id: string;
  faculty_id: string;
  section_id: string;
  term: TermCode;
  workload_units: number;
  assignment_role: AssignmentRole;
  assigned_date: string;
  status: AssignmentStatus;
  created_at: string;
}

export interface DemandForecast {
  _id: string;
  course_id: string;
  term: TermCode;
  history_term_1: TermCode;
  history_term_2: TermCode;
  history_term_3: TermCode;
  hist_demand_1: number;
  hist_demand_2: number;
  hist_demand_3: number;
  weighted_average: number;
  trend_adjustment: number;
  forecast_enrollment: number;
  confidence: ConfidenceLevel;
  method: string;
  computed_at: string;
}

export interface UnmetDemand {
  _id: string;
  course_id: string;
  term: TermCode;
  forecast_enrollment: number;
  allocated_capacity: number;
  unmet_count: number;
  reason_code: UnmetReason;
  details: Record<string, unknown>;
  created_at: string;
}

export interface FacultyCandidate {
  faculty_id: string;
  score: number;
  proficiency: Proficiency;
  remaining_workload: number;
  department_match: boolean;
  reasons: string[];
}

export interface CandidateSnapshot {
  slot: { day: DayOfWeek; start_time: string; end_time: string } | null;
  chosen_room_id: string | null;
  chosen_faculty_id: string | null;
  room_capacity: number | null;
  top_candidates: FacultyCandidate[];
  notes: string;
}

export interface AllocationDecision {
  _id: string;
  section_id: string | null;
  course_id: string;
  faculty_id: string | null;
  room_id: string | null;
  term: TermCode;
  decision_type: DecisionType;
  score: number;
  candidate_snapshot: CandidateSnapshot;
  rationale: string;
  created_at: string;
}

export interface LifecycleEvent {
  _id: string;
  entity_type: EntityType;
  entity_id: string;
  from_state: string | null;
  to_state: string;
  event_type: EventType;
  event_ts: string;
  actor: Actor;
  reason: string;
  created_at: string;
}

export interface GroundTruthAnomaly {
  _id: string;
  issue_type: IssueType;
  entity_type: EntityType;
  entity_id: string;
  related_entity_id: string | null;
  expected_rule: string;
  expected_action: string;
  severity: Severity;
  injected: boolean;
  notes: string;
  created_at: string;
}

export interface ValidationCheckSummary {
  check_id: string;
  name: string;
  status: ValidationStatus;
  violations: number;
  expected: number;
  unexpected: number;
}

export interface ValidationViolation {
  check_id: string;
  severity: Severity;
  collection: string;
  entity_id: string;
  related_entity_id: string | null;
  message: string;
  expected: boolean;
  anomaly_id: string | null;
}

export interface ValidationSummary {
  status: ValidationStatus;
  total_checks: number;
  checks: ValidationCheckSummary[];
  total_violations: number;
  expected_violations: number;
  unexpected_violations: number;
  anomalies_expected: number;
  anomalies_detected: number;
  anomalies_missed: number;
  detection_rate: number;
}

export interface ValidationRun {
  _id: string;
  run_id: string;
  scale: ScaleName;
  seed: number;
  as_of: string;
  status: ValidationStatus;
  summary: ValidationSummary;
  violations: ValidationViolation[];
  created_at: string;
}

export interface PipelineRun {
  _id: string;
  scale: ScaleName;
  seed: number;
  as_of: string;
  db_name: string;
  status: PipelineStatus;
  counts: Record<string, number>;
  checksums: Record<string, string>;
  started_at: string;
  completed_at: string | null;
}

export interface ForecastEvaluationRow {
  course_id: string;
  forecast: number;
  actual: number;
  naive: number;
  error: number;
}

export interface ForecastMetrics {
  term: string;
  method: string;
  course_count: number;
  mae: number;
  rmse: number;
  mape: number;
  bias: number;
  naive_mae: number;
  improvement_vs_naive: number;
  generated_at: string;
  per_course: ForecastEvaluationRow[];
}

export interface AllocationMetrics {
  term: string;
  course_count: number;
  forecast_total: number;
  allocated_capacity: number;
  demand_met_pct: number;
  unmet_total: number;
  unmet_by_reason: Record<string, number>;
  section_count: number;
  avg_fill_rate: number;
  faculty_count: number;
  avg_workload_utilization: number;
  skill_match_pct: number;
  room_count: number;
  room_utilization_pct: number;
  decision_count: number;
  explainability_pct: number;
  generated_at: string;
}

export interface ReproducibilityRunResult {
  db: string;
  counts: Record<string, number>;
  hashes: Record<string, string>;
}

export interface ReproducibilityReport {
  scale: ScaleName;
  seed: number;
  as_of: string;
  match: boolean;
  run_a: ReproducibilityRunResult;
  run_b: ReproducibilityRunResult;
  compared_files: number;
  mismatches: string[];
  generated_at: string;
}

export interface ListResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type CollectionDocumentMap = {
  terms: Term;
  programs: Program;
  courses: Course;
  prerequisites: Prerequisite;
  students: Student;
  studentPlans: StudentPlan;
  registrationInterests: RegistrationInterest;
  faculty: Faculty;
  facultySkills: FacultySkill;
  availabilities: Availability;
  rooms: Room;
  sections: Section;
  workloadAssignments: WorkloadAssignment;
  demandForecasts: DemandForecast;
  unmetDemands: UnmetDemand;
  allocationDecisions: AllocationDecision;
  lifecycleEvents: LifecycleEvent;
  groundTruthAnomalies: GroundTruthAnomaly;
  validationRuns: ValidationRun;
  pipelineRuns: PipelineRun;
};

export type CollectionDocument<K extends CollectionName> = CollectionDocumentMap[K];

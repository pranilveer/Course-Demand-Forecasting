-- YottaFlex deterministic SQLite-compatible schema
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS "terms" (
  "_id" TEXT PRIMARY KEY,
  "academic_year" INTEGER NOT NULL,
  "term_name" TEXT NOT NULL,
  "start_date" TEXT NOT NULL,
  "end_date" TEXT NOT NULL,
  "is_target" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS "programs" (
  "_id" TEXT PRIMARY KEY,
  "program_code" TEXT NOT NULL,
  "program_name" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "degree_level" TEXT NOT NULL,
  "duration_terms" INTEGER NOT NULL,
  "total_credits_required" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "effective_start_date" TEXT NOT NULL,
  "effective_end_date" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_programs_department" ON "programs" ("department");

CREATE TABLE IF NOT EXISTS "courses" (
  "_id" TEXT PRIMARY KEY,
  "program_id" TEXT NOT NULL,
  "course_code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "contact_hours" REAL NOT NULL,
  "course_level" INTEGER NOT NULL,
  "course_type" TEXT NOT NULL,
  "term_offered" TEXT NOT NULL,
  "max_section_size" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "effective_start_date" TEXT NOT NULL,
  "effective_end_date" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_courses_program_id" ON "courses" ("program_id");
CREATE INDEX IF NOT EXISTS "idx_courses_course_level" ON "courses" ("course_level");
CREATE INDEX IF NOT EXISTS "idx_courses_course_type" ON "courses" ("course_type");

CREATE TABLE IF NOT EXISTS "prerequisites" (
  "_id" TEXT PRIMARY KEY,
  "course_id" TEXT NOT NULL,
  "prerequisite_course_id" TEXT NOT NULL,
  "min_grade" TEXT NOT NULL,
  "is_strict" INTEGER NOT NULL,
  "effective_start_date" TEXT NOT NULL,
  "effective_end_date" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_prerequisites_course_id" ON "prerequisites" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_prerequisites_prerequisite_course_id" ON "prerequisites" ("prerequisite_course_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_prerequisites_course_id_prerequisite_course_id" ON "prerequisites" ("course_id", "prerequisite_course_id");

CREATE TABLE IF NOT EXISTS "students" (
  "_id" TEXT PRIMARY KEY,
  "program_id" TEXT NOT NULL,
  "cohort_year" INTEGER NOT NULL,
  "entry_term" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_students_program_id" ON "students" ("program_id");
CREATE INDEX IF NOT EXISTS "idx_students_status" ON "students" ("status");

CREATE TABLE IF NOT EXISTS "studentPlans" (
  "_id" TEXT PRIMARY KEY,
  "student_id" TEXT NOT NULL,
  "program_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "plan_sequence" INTEGER NOT NULL,
  "planned_credits" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_studentPlans_student_id" ON "studentPlans" ("student_id");
CREATE INDEX IF NOT EXISTS "idx_studentPlans_course_id" ON "studentPlans" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_studentPlans_term" ON "studentPlans" ("term");
CREATE INDEX IF NOT EXISTS "idx_studentPlans_student_id_term" ON "studentPlans" ("student_id", "term");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_studentPlans_student_id_course_id_term" ON "studentPlans" ("student_id", "course_id", "term");

CREATE TABLE IF NOT EXISTS "registrationInterests" (
  "_id" TEXT PRIMARY KEY,
  "student_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "interest_status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "expressed_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_registrationInterests_student_id" ON "registrationInterests" ("student_id");
CREATE INDEX IF NOT EXISTS "idx_registrationInterests_course_id" ON "registrationInterests" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_registrationInterests_term" ON "registrationInterests" ("term");
CREATE INDEX IF NOT EXISTS "idx_registrationInterests_course_id_term" ON "registrationInterests" ("course_id", "term");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_registrationInterests_student_id_course_id_term" ON "registrationInterests" ("student_id", "course_id", "term");

CREATE TABLE IF NOT EXISTS "faculty" (
  "_id" TEXT PRIMARY KEY,
  "display_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "employment_type" TEXT NOT NULL,
  "max_workload_units" INTEGER NOT NULL,
  "min_workload_units" INTEGER NOT NULL,
  "hire_date" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_faculty_department" ON "faculty" ("department");
CREATE INDEX IF NOT EXISTS "idx_faculty_status" ON "faculty" ("status");
CREATE INDEX IF NOT EXISTS "idx_faculty_employment_type" ON "faculty" ("employment_type");

CREATE TABLE IF NOT EXISTS "facultySkills" (
  "_id" TEXT PRIMARY KEY,
  "faculty_id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "proficiency" TEXT NOT NULL,
  "certified_date" TEXT NOT NULL,
  "expires_date" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_facultySkills_faculty_id" ON "facultySkills" ("faculty_id");
CREATE INDEX IF NOT EXISTS "idx_facultySkills_course_id" ON "facultySkills" ("course_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_facultySkills_faculty_id_course_id" ON "facultySkills" ("faculty_id", "course_id");

CREATE TABLE IF NOT EXISTS "availabilities" (
  "_id" TEXT PRIMARY KEY,
  "faculty_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "day_of_week" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "availability_type" TEXT NOT NULL,
  "max_sessions" INTEGER,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_availabilities_faculty_id" ON "availabilities" ("faculty_id");
CREATE INDEX IF NOT EXISTS "idx_availabilities_term" ON "availabilities" ("term");
CREATE INDEX IF NOT EXISTS "idx_availabilities_faculty_id_term" ON "availabilities" ("faculty_id", "term");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_availabilities_faculty_id_term_day_of_week_start_time" ON "availabilities" ("faculty_id", "term", "day_of_week", "start_time");

CREATE TABLE IF NOT EXISTS "rooms" (
  "_id" TEXT PRIMARY KEY,
  "building" TEXT NOT NULL,
  "room_number" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "room_type" TEXT NOT NULL,
  "has_projector" INTEGER NOT NULL,
  "accessibility" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "effective_start_date" TEXT NOT NULL,
  "effective_end_date" TEXT,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_rooms_building" ON "rooms" ("building");
CREATE INDEX IF NOT EXISTS "idx_rooms_room_type" ON "rooms" ("room_type");
CREATE INDEX IF NOT EXISTS "idx_rooms_status" ON "rooms" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_rooms_building_room_number" ON "rooms" ("building", "room_number");

CREATE TABLE IF NOT EXISTS "sections" (
  "_id" TEXT PRIMARY KEY,
  "course_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "section_no" INTEGER NOT NULL,
  "room_id" TEXT,
  "capacity" INTEGER NOT NULL,
  "enrolled_count" INTEGER NOT NULL,
  "schedule_day" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "delivery_mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sections_course_id" ON "sections" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_sections_term" ON "sections" ("term");
CREATE INDEX IF NOT EXISTS "idx_sections_room_id" ON "sections" ("room_id");
CREATE INDEX IF NOT EXISTS "idx_sections_course_id_term" ON "sections" ("course_id", "term");
CREATE INDEX IF NOT EXISTS "idx_sections_course_id_term_section_no" ON "sections" ("course_id", "term", "section_no");

CREATE TABLE IF NOT EXISTS "workloadAssignments" (
  "_id" TEXT PRIMARY KEY,
  "faculty_id" TEXT NOT NULL,
  "section_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "workload_units" REAL NOT NULL,
  "assignment_role" TEXT NOT NULL,
  "assigned_date" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_workloadAssignments_faculty_id" ON "workloadAssignments" ("faculty_id");
CREATE INDEX IF NOT EXISTS "idx_workloadAssignments_section_id" ON "workloadAssignments" ("section_id");
CREATE INDEX IF NOT EXISTS "idx_workloadAssignments_term" ON "workloadAssignments" ("term");
CREATE INDEX IF NOT EXISTS "idx_workloadAssignments_faculty_id_term" ON "workloadAssignments" ("faculty_id", "term");

CREATE TABLE IF NOT EXISTS "demandForecasts" (
  "_id" TEXT PRIMARY KEY,
  "course_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "history_term_1" TEXT NOT NULL,
  "history_term_2" TEXT NOT NULL,
  "history_term_3" TEXT NOT NULL,
  "hist_demand_1" INTEGER NOT NULL,
  "hist_demand_2" INTEGER NOT NULL,
  "hist_demand_3" INTEGER NOT NULL,
  "weighted_average" REAL NOT NULL,
  "trend_adjustment" REAL NOT NULL,
  "forecast_enrollment" INTEGER NOT NULL,
  "confidence" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "computed_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_demandForecasts_course_id" ON "demandForecasts" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_demandForecasts_term" ON "demandForecasts" ("term");
CREATE INDEX IF NOT EXISTS "idx_demandForecasts_confidence" ON "demandForecasts" ("confidence");
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_demandForecasts_course_id_term_method" ON "demandForecasts" ("course_id", "term", "method");

CREATE TABLE IF NOT EXISTS "unmetDemands" (
  "_id" TEXT PRIMARY KEY,
  "course_id" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "forecast_enrollment" INTEGER NOT NULL,
  "allocated_capacity" INTEGER NOT NULL,
  "unmet_count" INTEGER NOT NULL,
  "reason_code" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_unmetDemands_course_id" ON "unmetDemands" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_unmetDemands_term" ON "unmetDemands" ("term");
CREATE INDEX IF NOT EXISTS "idx_unmetDemands_reason_code" ON "unmetDemands" ("reason_code");

CREATE TABLE IF NOT EXISTS "allocationDecisions" (
  "_id" TEXT PRIMARY KEY,
  "section_id" TEXT,
  "course_id" TEXT NOT NULL,
  "faculty_id" TEXT,
  "room_id" TEXT,
  "term" TEXT NOT NULL,
  "decision_type" TEXT NOT NULL,
  "score" REAL NOT NULL,
  "candidate_snapshot" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_allocationDecisions_section_id" ON "allocationDecisions" ("section_id");
CREATE INDEX IF NOT EXISTS "idx_allocationDecisions_course_id" ON "allocationDecisions" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_allocationDecisions_faculty_id" ON "allocationDecisions" ("faculty_id");
CREATE INDEX IF NOT EXISTS "idx_allocationDecisions_term" ON "allocationDecisions" ("term");

CREATE TABLE IF NOT EXISTS "lifecycleEvents" (
  "_id" TEXT PRIMARY KEY,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "from_state" TEXT,
  "to_state" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_ts" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_lifecycleEvents_entity_type_entity_id" ON "lifecycleEvents" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_lifecycleEvents_event_ts" ON "lifecycleEvents" ("event_ts");
CREATE INDEX IF NOT EXISTS "idx_lifecycleEvents_event_type" ON "lifecycleEvents" ("event_type");

CREATE TABLE IF NOT EXISTS "groundTruthAnomalies" (
  "_id" TEXT PRIMARY KEY,
  "issue_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "related_entity_id" TEXT,
  "expected_rule" TEXT NOT NULL,
  "expected_action" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "injected" INTEGER NOT NULL,
  "notes" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_groundTruthAnomalies_issue_type" ON "groundTruthAnomalies" ("issue_type");
CREATE INDEX IF NOT EXISTS "idx_groundTruthAnomalies_entity_type_entity_id" ON "groundTruthAnomalies" ("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "validationRuns" (
  "_id" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "scale" TEXT NOT NULL,
  "seed" INTEGER NOT NULL,
  "as_of" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "violations" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_validationRuns_run_id" ON "validationRuns" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_validationRuns_status" ON "validationRuns" ("status");
CREATE INDEX IF NOT EXISTS "idx_validationRuns_created_at" ON "validationRuns" ("created_at");

CREATE TABLE IF NOT EXISTS "pipelineRuns" (
  "_id" TEXT PRIMARY KEY,
  "scale" TEXT NOT NULL,
  "seed" INTEGER NOT NULL,
  "as_of" TEXT NOT NULL,
  "db_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "counts" TEXT NOT NULL,
  "checksums" TEXT NOT NULL,
  "started_at" TEXT NOT NULL,
  "completed_at" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_pipelineRuns_scale" ON "pipelineRuns" ("scale");
CREATE INDEX IF NOT EXISTS "idx_pipelineRuns_seed" ON "pipelineRuns" ("seed");
CREATE INDEX IF NOT EXISTS "idx_pipelineRuns_status" ON "pipelineRuns" ("status");

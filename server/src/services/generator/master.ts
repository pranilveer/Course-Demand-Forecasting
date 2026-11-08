import {
  DEGREE_LEVEL_WEIGHTS,
  DEPARTMENTS,
  EMPLOYMENT_TYPE_WEIGHTS,
  ID_PREFIXES,
  ROOM_TYPE_WEIGHTS,
  TARGET_TERM,
  TERM_CODES,
  TERM_DATES,
  makeId,
  type Course,
  type CourseType,
  type DegreeLevel,
  type Department,
  type Faculty,
  type FacultySkill,
  type Prerequisite,
  type Program,
  type Room,
  type Student,
  type Term,
  type TermCode,
  Rng,
} from '@yottaflex/shared';
import { randomDate } from '../../lib/time.js';
import type { GeneratorConfig, MasterDataset } from './types.js';

const DEPARTMENT_PREFIX: Record<Department, string> = {
  'Computer Science': 'CS',
  'Electrical Engineering': 'EE',
  'Mechanical Engineering': 'ME',
  Business: 'BUS',
  Mathematics: 'MATH',
  Physics: 'PHYS',
  Biology: 'BIO',
  Psychology: 'PSY',
  Design: 'DSGN',
  Economics: 'ECON',
};

const DEGREE_PREFIX: Record<DegreeLevel, string> = {
  Certificate: 'CERT',
  Diploma: 'DIP',
  Bachelor: 'BSC',
  Master: 'MSC',
};

const DEGREE_NAME_PREFIX: Record<DegreeLevel, string> = {
  Certificate: 'Certificate in',
  Diploma: 'Diploma in',
  Bachelor: 'Bachelor of',
  Master: 'Master of',
};

const DEGREE_DURATION: Record<DegreeLevel, number> = {
  Certificate: 2,
  Diploma: 4,
  Bachelor: 8,
  Master: 4,
};

const DEGREE_CREDITS: Record<DegreeLevel, number> = {
  Certificate: 30,
  Diploma: 60,
  Bachelor: 120,
  Master: 36,
};

const SPECIALIZATIONS: Record<Department, readonly string[]> = {
  'Computer Science': [
    'Software Engineering',
    'Artificial Intelligence',
    'Cybersecurity',
    'Data Science',
  ],
  'Electrical Engineering': [
    'Power Systems',
    'Embedded Systems',
    'Communications',
    'Control Systems',
  ],
  'Mechanical Engineering': [
    'Thermodynamics',
    'Robotics',
    'Manufacturing',
    'Aerospace Systems',
  ],
  Business: ['Finance', 'Marketing', 'Operations', 'Entrepreneurship'],
  Mathematics: ['Applied Mathematics', 'Statistics', 'Discrete Mathematics', 'Mathematical Modelling'],
  Physics: ['Astrophysics', 'Quantum Physics', 'Condensed Matter', 'Computational Physics'],
  Biology: ['Genetics', 'Microbiology', 'Ecology', 'Molecular Biology'],
  Psychology: ['Cognitive Psychology', 'Clinical Psychology', 'Developmental Psychology', 'Neuroscience'],
  Design: ['Interaction Design', 'Visual Communication', 'Product Design', 'Design Strategy'],
  Economics: ['Macroeconomics', 'Microeconomics', 'Development Economics', 'Econometrics'],
};

const STUDENT_STATUS_WEIGHTS: Record<
  number,
  Array<{ value: 'Active' | 'Graduated' | 'Withdrawn'; weight: number }>
> = {
  2023: [
    { value: 'Active', weight: 60 },
    { value: 'Graduated', weight: 30 },
    { value: 'Withdrawn', weight: 10 },
  ],
  2024: [
    { value: 'Active', weight: 80 },
    { value: 'Graduated', weight: 15 },
    { value: 'Withdrawn', weight: 5 },
  ],
  2025: [
    { value: 'Active', weight: 90 },
    { value: 'Withdrawn', weight: 10 },
  ],
  2026: [
    { value: 'Active', weight: 95 },
    { value: 'Withdrawn', weight: 5 },
  ],
};

const COHORT_WEIGHTS = [
  { value: 2023, weight: 15 },
  { value: 2024, weight: 20 },
  { value: 2025, weight: 30 },
  { value: 2026, weight: 35 },
];

const FACULTY_STATUS_WEIGHTS = [
  { value: 'Active' as const, weight: 90 },
  { value: 'OnLeave' as const, weight: 5 },
  { value: 'Inactive' as const, weight: 5 },
];

const PROFICIENCY_WEIGHTS = [
  { value: 'Primary' as const, weight: 50 },
  { value: 'Secondary' as const, weight: 30 },
  { value: 'Trained' as const, weight: 20 },
];

const ROOM_STATUS_WEIGHTS = [
  { value: 'Available' as const, weight: 85 },
  { value: 'Maintenance' as const, weight: 10 },
  { value: 'Inactive' as const, weight: 5 },
];

const SKILL_COUNT_WEIGHTS = [
  { value: 1, weight: 45 },
  { value: 2, weight: 30 },
  { value: 3, weight: 18 },
  { value: 4, weight: 7 },
];

function buildLevels(count: number): number[] {
  const levels = [100, 100, 200, 200, 300, 300, 400, 400];
  let toggle = 0;
  while (levels.length < count) {
    levels.push(toggle % 2 === 0 ? 100 : 300);
    toggle += 1;
  }
  return levels.slice(0, count).sort((left, right) => left - right);
}

function buildCourseTypes(count: number, rng: Rng): CourseType[] {
  const coreCount = Math.max(1, Math.round(count * 0.6));
  const electiveCount = Math.max(0, Math.round(count * 0.3));
  const labCount = Math.max(0, count - coreCount - electiveCount);
  const types: CourseType[] = [
    ...Array<CourseType>(coreCount).fill('Core'),
    ...Array<CourseType>(electiveCount).fill('Elective'),
    ...Array<CourseType>(labCount).fill('Lab'),
  ];
  while (types.length < count) {
    types.push('Seminar');
  }
  return rng.shuffle(types.slice(0, count));
}

function programSpecialization(program: Program): string {
  return program.program_name.replace(/^(Certificate in|Diploma in|Bachelor of|Master of) /, '');
}

export function buildTerms(asOf: string): Term[] {
  return TERM_CODES.map((term): Term => {
    const dates = TERM_DATES[term];
    return {
      _id: term,
      academic_year: dates.academicYear,
      term_name: dates.name,
      start_date: dates.start,
      end_date: dates.end,
      is_target: term === TARGET_TERM,
      status: term === TARGET_TERM ? 'Planned' : 'Closed',
      created_at: asOf,
    };
  });
}

export function buildPrograms(config: GeneratorConfig, rng: Rng): Program[] {
  const programs: Program[] = [];
  for (let index = 0; index < config.programs; index += 1) {
    const department = DEPARTMENTS[index % DEPARTMENTS.length] as Department;
    const degreeLevel = rng.weighted(DEGREE_LEVEL_WEIGHTS);
    const specialization = rng.pick(SPECIALIZATIONS[department]);
    const inactive = rng.bool(0.05);
    programs.push({
      _id: makeId(ID_PREFIXES.program, index + 1),
      program_code: `${DEPARTMENT_PREFIX[department]}-${DEGREE_PREFIX[degreeLevel]}-${String(
        index + 1,
      ).padStart(3, '0')}`,
      program_name: `${DEGREE_NAME_PREFIX[degreeLevel]} ${specialization}`,
      department,
      degree_level: degreeLevel,
      duration_terms: DEGREE_DURATION[degreeLevel],
      total_credits_required: DEGREE_CREDITS[degreeLevel],
      status: inactive ? 'Inactive' : 'Active',
      effective_start_date: '2020-08-01',
      effective_end_date: inactive ? '2026-06-30' : null,
      created_at: config.asOf,
    });
  }
  return programs;
}

export function buildCourses(
  config: GeneratorConfig,
  programs: Program[],
  rng: Rng,
): Course[] {
  const courses: Course[] = [];
  const baseCount = Math.floor(config.courses / programs.length);
  const remainder = config.courses % programs.length;
  let counter = 0;

  programs.forEach((program, programIndex) => {
    const count = baseCount + (programIndex < remainder ? 1 : 0);
    if (count === 0) {
      return;
    }
    const levels = buildLevels(count);
    const types = buildCourseTypes(count, rng);
    const specialization = programSpecialization(program);

    for (let courseIndex = 0; courseIndex < count; courseIndex += 1) {
      counter += 1;
      const level = levels[courseIndex] as number;
      const courseType = types[courseIndex] as CourseType;
      const inactive = rng.bool(0.05);
      const credits = courseType === 'Lab' ? 4 : 3;
      const maxSectionSize =
        courseType === 'Lab'
          ? 20
          : courseType === 'Seminar'
            ? 25
            : courseType === 'Elective'
              ? 35
              : 40;

      courses.push({
        _id: makeId(ID_PREFIXES.course, counter),
        program_id: program._id,
        course_code: `${DEPARTMENT_PREFIX[program.department]}-${level}${String(counter).padStart(
          3,
          '0',
        )}`,
        title: `${specialization} ${courseType} ${level}`,
        credits,
        contact_hours: credits,
        course_level: level,
        course_type: courseType,
        term_offered: courseType === 'Lab' ? 'Fall' : 'Both',
        max_section_size: maxSectionSize,
        status: inactive ? 'Inactive' : 'Active',
        effective_start_date: '2021-08-01',
        effective_end_date: inactive ? '2025-12-31' : null,
        created_at: config.asOf,
      });
    }
  });

  return courses;
}

export function buildPrerequisites(
  courses: Course[],
  rng: Rng,
  asOf: string,
): Prerequisite[] {
  const coursesByProgram = new Map<string, Course[]>();
  for (const course of courses) {
    const bucket = coursesByProgram.get(course.program_id) ?? [];
    bucket.push(course);
    coursesByProgram.set(course.program_id, bucket);
  }

  const prerequisites: Prerequisite[] = [];
  let counter = 0;

  for (const course of courses) {
    if (course.course_level <= 100 || course.course_type !== 'Core') {
      continue;
    }
    const programCourses = coursesByProgram.get(course.program_id) ?? [];
    const eligible = programCourses.filter(
      (candidate) =>
        candidate.course_level < course.course_level && candidate.status === 'Active',
    );
    if (eligible.length === 0) {
      continue;
    }
    const requested = rng.bool(0.5) ? 1 : 2;
    const chosen = rng.sample(eligible, Math.min(requested, eligible.length));
    for (const prerequisite of chosen) {
      counter += 1;
      prerequisites.push({
        _id: makeId(ID_PREFIXES.prerequisite, counter),
        course_id: course._id,
        prerequisite_course_id: prerequisite._id,
        min_grade: 'C',
        is_strict: true,
        effective_start_date: course.effective_start_date,
        effective_end_date: null,
        created_at: asOf,
      });
    }
  }

  return prerequisites;
}

export function buildStudents(
  config: GeneratorConfig,
  programs: Program[],
  rng: Rng,
): Student[] {
  const activePrograms = programs.filter((program) => program.status === 'Active');
  const pool = activePrograms.length > 0 ? activePrograms : programs;
  const students: Student[] = [];

  for (let index = 0; index < config.students; index += 1) {
    const program = pool[index % pool.length] as Program;
    const cohortYear = rng.weighted(COHORT_WEIGHTS);
    const entryTerm = `${cohortYear}-Fall` as TermCode;
    students.push({
      _id: makeId(ID_PREFIXES.student, index + 1),
      program_id: program._id,
      cohort_year: cohortYear,
      entry_term: entryTerm,
      status: rng.weighted(STUDENT_STATUS_WEIGHTS[cohortYear] ?? STUDENT_STATUS_WEIGHTS[2025]!),
      created_at: config.asOf,
    });
  }

  return students;
}

export function buildFaculty(config: GeneratorConfig, rng: Rng): Faculty[] {
  const faculty: Faculty[] = [];

  for (let index = 0; index < config.faculty; index += 1) {
    const department = DEPARTMENTS[index % DEPARTMENTS.length] as Department;
    const employmentType = rng.weighted(EMPLOYMENT_TYPE_WEIGHTS);
    const maxWorkload =
      employmentType === 'FullTime'
        ? rng.nextInt(12, 15)
        : employmentType === 'PartTime'
          ? rng.nextInt(6, 9)
          : rng.nextInt(3, 6);
    const minWorkload =
      employmentType === 'FullTime'
        ? rng.nextInt(6, 9)
        : employmentType === 'PartTime'
          ? rng.nextInt(3, 5)
          : rng.nextInt(0, 2);
    const identifier = String(index + 1).padStart(6, '0');

    faculty.push({
      _id: makeId(ID_PREFIXES.faculty, index + 1),
      display_name: `Faculty ${identifier}`,
      email: `faculty${identifier}@example.edu`,
      department,
      employment_type: employmentType,
      max_workload_units: maxWorkload,
      min_workload_units: Math.min(minWorkload, maxWorkload),
      hire_date: randomDate(rng, '2008-01-01', '2025-12-31'),
      status: rng.weighted(FACULTY_STATUS_WEIGHTS),
      created_at: config.asOf,
    });
  }

  return faculty;
}

export function buildFacultySkills(
  config: GeneratorConfig,
  faculty: Faculty[],
  courses: Course[],
  programs: Program[],
  rng: Rng,
): FacultySkill[] {
  const programById = new Map(programs.map((program) => [program._id, program]));
  const facultyByDepartment = new Map<Department, Faculty[]>();
  for (const member of faculty) {
    const bucket = facultyByDepartment.get(member.department) ?? [];
    bucket.push(member);
    facultyByDepartment.set(member.department, bucket);
  }

  const skills: FacultySkill[] = [];
  const seen = new Set<string>();
  const skillCountByFaculty = new Map<string, number>();
  let counter = 0;

  const addSkill = (facultyId: string, courseId: string): void => {
    const key = `${facultyId}:${courseId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    counter += 1;
    skills.push({
      _id: makeId(ID_PREFIXES.facultySkill, counter),
      faculty_id: facultyId,
      course_id: courseId,
      proficiency: rng.weighted(PROFICIENCY_WEIGHTS),
      certified_date: randomDate(rng, '2018-01-01', '2025-12-31'),
      expires_date: rng.bool(0.2) ? randomDate(rng, '2027-01-01', '2028-12-31') : null,
      created_at: config.asOf,
    });
    skillCountByFaculty.set(facultyId, (skillCountByFaculty.get(facultyId) ?? 0) + 1);
  };

  for (const course of courses) {
    const program = programById.get(course.program_id);
    if (!program) {
      continue;
    }
    const pool = facultyByDepartment.get(program.department) ?? [];
    if (pool.length === 0 || rng.bool(0.1)) {
      continue;
    }
    const count = Math.min(pool.length, rng.weighted(SKILL_COUNT_WEIGHTS));
    for (const member of rng.sample(pool, count)) {
      addSkill(member._id, course._id);
    }
  }

  for (const member of faculty) {
    if ((skillCountByFaculty.get(member._id) ?? 0) > 0) {
      continue;
    }
    const departmentCourses = courses.filter((course) => {
      const program = programById.get(course.program_id);
      return program?.department === member.department && course.status === 'Active';
    });
    if (departmentCourses.length > 0) {
      addSkill(member._id, rng.pick(departmentCourses)._id);
    }
  }

  return skills;
}

export function buildRooms(config: GeneratorConfig, rng: Rng): Room[] {
  const rooms: Room[] = [];

  for (let index = 0; index < config.rooms; index += 1) {
    const building = String.fromCharCode(65 + (index % 6));
    const roomNumber = `${Math.floor(index / 6) + 1}${String((index % 6) + 1).padStart(2, '0')}`;
    const roomType = rng.weighted(ROOM_TYPE_WEIGHTS);
    const capacity =
      roomType === 'Lab' || roomType === 'ComputerLab'
        ? rng.pick([20, 24, 28, 32, 36, 40])
        : roomType === 'Seminar'
          ? rng.pick([20, 25, 30, 35, 40])
          : rng.pick([40, 50, 60, 75, 90, 120, 150, 180, 200]);
    const status = rng.weighted(ROOM_STATUS_WEIGHTS);

    rooms.push({
      _id: makeId(ID_PREFIXES.room, index + 1),
      building,
      room_number: roomNumber,
      capacity,
      room_type: roomType,
      has_projector: rng.bool(roomType === 'Lab' || roomType === 'ComputerLab' ? 0.8 : 0.7),
      accessibility: rng.bool(0.5),
      status,
      effective_start_date: '2020-08-01',
      effective_end_date: status === 'Inactive' ? '2025-12-31' : null,
      created_at: config.asOf,
    });
  }

  return rooms;
}

export function buildMasterDataset(config: GeneratorConfig, seed: number): MasterDataset {
  const root = new Rng(seed, 'master');
  const terms = buildTerms(config.asOf);
  const programs = buildPrograms(config, root.fork('programs'));
  const courses = buildCourses(config, programs, root.fork('courses'));
  const prerequisites = buildPrerequisites(courses, root.fork('prerequisites'), config.asOf);
  const students = buildStudents(config, programs, root.fork('students'));
  const faculty = buildFaculty(config, root.fork('faculty'));
  const facultySkills = buildFacultySkills(
    config,
    faculty,
    courses,
    programs,
    root.fork('facultySkills'),
  );
  const rooms = buildRooms(config, root.fork('rooms'));

  return {
    terms,
    programs,
    courses,
    prerequisites,
    students,
    faculty,
    facultySkills,
    rooms,
  };
}

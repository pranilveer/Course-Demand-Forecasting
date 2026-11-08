import type {
  Availability,
  Course,
  Faculty,
  FacultySkill,
  LifecycleEvent,
  Prerequisite,
  Program,
  RegistrationInterest,
  Room,
  ScaleName,
  Student,
  StudentPlan,
  Term,
} from '@yottaflex/shared';

export interface GeneratorConfig {
  scale: ScaleName;
  seed: number;
  asOf: string;
  programs: number;
  courses: number;
  faculty: number;
  students: number;
  studentPlans: number;
  rooms: number;
  anomalyPerType: number;
}

export interface MasterDataset {
  terms: Term[];
  programs: Program[];
  courses: Course[];
  prerequisites: Prerequisite[];
  students: Student[];
  faculty: Faculty[];
  facultySkills: FacultySkill[];
  rooms: Room[];
}

export interface Dataset extends MasterDataset {
  studentPlans: StudentPlan[];
  registrationInterests: RegistrationInterest[];
  availabilities: Availability[];
  lifecycleEvents: LifecycleEvent[];
}

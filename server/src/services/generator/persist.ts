import { insertBatched } from '../../db.js';
import {
  AvailabilityModel,
  CourseModel,
  FacultyModel,
  FacultySkillModel,
  LifecycleEventModel,
  PrerequisiteModel,
  ProgramModel,
  RegistrationInterestModel,
  RoomModel,
  StudentModel,
  StudentPlanModel,
  TermModel,
} from '../../models/index.js';
import type { Dataset } from './types.js';

export async function persistDataset(dataset: Dataset): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  counts.terms = await insertBatched(TermModel, dataset.terms);
  counts.programs = await insertBatched(ProgramModel, dataset.programs);
  counts.courses = await insertBatched(CourseModel, dataset.courses);
  counts.prerequisites = await insertBatched(PrerequisiteModel, dataset.prerequisites);
  counts.students = await insertBatched(StudentModel, dataset.students);
  counts.studentPlans = await insertBatched(StudentPlanModel, dataset.studentPlans);
  counts.registrationInterests = await insertBatched(
    RegistrationInterestModel,
    dataset.registrationInterests,
  );
  counts.faculty = await insertBatched(FacultyModel, dataset.faculty);
  counts.facultySkills = await insertBatched(FacultySkillModel, dataset.facultySkills);
  counts.availabilities = await insertBatched(AvailabilityModel, dataset.availabilities);
  counts.rooms = await insertBatched(RoomModel, dataset.rooms);
  counts.lifecycleEvents = await insertBatched(LifecycleEventModel, dataset.lifecycleEvents);

  return counts;
}

import { insertBatched } from '../../db.js';
import {
  CourseModel,
  FacultyModel,
  FacultySkillModel,
  PrerequisiteModel,
  ProgramModel,
  RoomModel,
  StudentModel,
  TermModel,
} from '../../models/index.js';
import type { MasterDataset } from './types.js';

export async function persistMasterDataset(
  dataset: MasterDataset,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  counts.terms = await insertBatched(TermModel, dataset.terms);
  counts.programs = await insertBatched(ProgramModel, dataset.programs);
  counts.courses = await insertBatched(CourseModel, dataset.courses);
  counts.prerequisites = await insertBatched(PrerequisiteModel, dataset.prerequisites);
  counts.students = await insertBatched(StudentModel, dataset.students);
  counts.faculty = await insertBatched(FacultyModel, dataset.faculty);
  counts.facultySkills = await insertBatched(FacultySkillModel, dataset.facultySkills);
  counts.rooms = await insertBatched(RoomModel, dataset.rooms);

  return counts;
}

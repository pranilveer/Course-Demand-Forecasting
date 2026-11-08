import { Rng } from '@yottaflex/shared';
import { buildMasterDataset } from './master.js';
import {
  buildAvailabilities,
  buildLifecycleEvents,
  buildRegistrationInterests,
  buildStudentPlans,
} from './transactions.js';
import type { Dataset, GeneratorConfig } from './types.js';

export function buildDataset(config: GeneratorConfig, seed: number): Dataset {
  const master = buildMasterDataset(config, seed);
  const root = new Rng(seed, 'dataset');

  const studentPlans = buildStudentPlans(
    config,
    master.students,
    master.courses,
    master.prerequisites,
    root.fork('studentPlans'),
  );
  const registrationInterests = buildRegistrationInterests(
    config,
    master.students,
    master.courses,
    master.programs,
    studentPlans,
    root.fork('registrationInterests'),
  );
  const availabilities = buildAvailabilities(
    config,
    master.faculty,
    root.fork('availabilities'),
  );

  const withoutEvents = {
    ...master,
    studentPlans,
    registrationInterests,
    availabilities,
  };
  const lifecycleEvents = buildLifecycleEvents(
    config,
    withoutEvents,
    root.fork('lifecycleEvents'),
  );

  return { ...withoutEvents, lifecycleEvents };
}

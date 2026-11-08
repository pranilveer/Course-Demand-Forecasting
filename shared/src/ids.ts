export const ID_PREFIXES = {
  program: 'PRG',
  course: 'CRS',
  prerequisite: 'PRQ',
  student: 'STU',
  studentPlan: 'STP',
  registrationInterest: 'REG',
  faculty: 'FAC',
  facultySkill: 'FSK',
  availability: 'AVL',
  room: 'ROM',
  section: 'SEC',
  workloadAssignment: 'WLA',
  demandForecast: 'FCT',
  unmetDemand: 'UND',
  allocationDecision: 'DEC',
  lifecycleEvent: 'EVT',
  anomaly: 'ANM',
  validationRun: 'VAL',
  pipelineRun: 'RUN',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

export function pad6(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`ID counter must be a non-negative integer: ${value}`);
  }
  return String(value).padStart(6, '0');
}

export function makeId(prefix: string, counter: number): string {
  return `${prefix}-${pad6(counter)}`;
}

export function makeTermId(prefix: string, year: number | string, counter: number): string {
  return `${prefix}-${year}-${pad6(counter)}`;
}

export function yearFromTerm(term: string): string {
  const year = term.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Invalid term: ${term}`);
  }
  return year;
}

export function parseId(id: string): { prefix: string; parts: string[] } {
  const [prefix, ...parts] = id.split('-');
  if (!prefix || parts.length === 0) {
    throw new Error(`Invalid ID: ${id}`);
  }
  return { prefix, parts };
}

export function isId(id: string, prefix?: string): boolean {
  const pattern = prefix
    ? new RegExp(`^${prefix}-\\d{6}$|^${prefix}-\\d{4}-\\d{6}$`)
    : /^[A-Z]{3}-(\d{4}-)?\d{6}$/;
  return pattern.test(id);
}

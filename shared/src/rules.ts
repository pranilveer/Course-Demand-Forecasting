export interface BusinessRule {
  id: string;
  title: string;
  description: string;
  enforced_by: string[];
}

export const BUSINESS_RULES: BusinessRule[] = [
  {
    id: 'BR-01',
    title: 'Program and course lifecycle',
    description:
      'Programs and courses have effective dates and Active/Inactive lifecycle states. Inactive records cannot receive new sections.',
    enforced_by: ['VAL-DATE-01', 'VAL-LIFE-01'],
  },
  {
    id: 'BR-02',
    title: 'Prerequisite DAG',
    description:
      'A course may require zero or more lower-level prerequisite courses. The prerequisite graph must be acyclic and a prerequisite cannot be the same course.',
    enforced_by: ['VAL-DATE-01', 'VAL-PREREQ-01'],
  },
  {
    id: 'BR-03',
    title: 'Student plan sequencing',
    description:
      'A planned course must have all strict prerequisites planned or completed in an earlier term for the same student.',
    enforced_by: ['VAL-PREREQ-01'],
  },
  {
    id: 'BR-04',
    title: 'Demand signal',
    description:
      'Registration interest counts non-cancelled rows. Forecasts use only the three historical Fall windows and never the target term.',
    enforced_by: ['VAL-FORECAST-01'],
  },
  {
    id: 'BR-05',
    title: 'Faculty skill eligibility',
    description:
      'A faculty member may be assigned to a section only when a valid, unexpired FacultySkill exists for the course.',
    enforced_by: ['VAL-SKILL-01'],
  },
  {
    id: 'BR-06',
    title: 'Faculty availability',
    description:
      'Assignments require an Available window covering the section slot. Faculty on leave or inactive cannot be assigned.',
    enforced_by: ['VAL-AVAIL-01'],
  },
  {
    id: 'BR-07',
    title: 'Workload limits',
    description:
      'The sum of workload units assigned to a faculty member in a term must not exceed the faculty maximum workload.',
    enforced_by: ['VAL-WORKLOAD-01'],
  },
  {
    id: 'BR-08',
    title: 'Room capacity and type',
    description:
      'Section capacity cannot exceed room capacity, and the room type must be compatible with the course type.',
    enforced_by: ['VAL-CAP-01', 'VAL-ROOM-01'],
  },
  {
    id: 'BR-09',
    title: 'Schedule conflicts',
    description:
      'A room or faculty member cannot be double-booked in the same day and time slot.',
    enforced_by: ['VAL-ROOM-01'],
  },
  {
    id: 'BR-10',
    title: 'Historical forecast window',
    description:
      'Forecast history terms must be strictly earlier than the target term and stored historical values must match registration-interest counts.',
    enforced_by: ['VAL-FORECAST-01'],
  },
  {
    id: 'BR-11',
    title: 'Unmet demand visibility',
    description:
      'For every forecast course, forecast enrollment equals effective allocated capacity plus unmet demand. Effective capacity excludes invalid, duplicate, or undersized sections.',
    enforced_by: ['VAL-UNMET-01'],
  },
  {
    id: 'BR-12',
    title: 'Traceability and lifecycle history',
    description:
      'State changes are append-only lifecycle events. The current status of an entity must match its latest lifecycle event.',
    enforced_by: ['VAL-LIFE-01'],
  },
  {
    id: 'BR-13',
    title: 'Ground truth separation',
    description:
      'Ground-truth anomaly labels are stored separately and are never read by generation, forecasting, or allocation.',
    enforced_by: ['TEST-GT-ISOLATION'],
  },
  {
    id: 'BR-14',
    title: 'Reproducibility',
    description:
      'The same seed and scale must produce identical row counts and artifact checksums across independent runs.',
    enforced_by: ['REPRODUCE-01'],
  },
];

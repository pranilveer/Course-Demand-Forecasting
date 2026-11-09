import { existsSync } from 'node:fs';
import { join } from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
  type RequestHandler,
} from 'express';
import helmet from 'helmet';
import mongoose, { type Model } from 'mongoose';
import {
  AS_OF,
  BUSINESS_RULES,
  COLLECTION_NAMES,
  HISTORY_TERMS,
  SCALES,
  SCHEMA,
  SEED,
  TARGET_TERM,
  TERM_CODES,
  TERM_DATES,
  type CollectionName,
  type ListResponse,
  type ScaleName,
} from '@yottaflex/shared';
import { config } from '../config.js';
import {
  AllocationDecisionModel,
  AvailabilityModel,
  CourseModel,
  DemandForecastModel,
  FacultyModel,
  FacultySkillModel,
  GroundTruthAnomalyModel,
  PipelineRunModel,
  PrerequisiteModel,
  ProgramModel,
  RegistrationInterestModel,
  RoomModel,
  SectionModel,
  StudentModel,
  StudentPlanModel,
  UnmetDemandModel,
  ValidationRunModel,
  WorkloadAssignmentModel,
  models,
} from '../models/index.js';
import { countCollections } from '../services/collections.js';
import { computeForecastMetrics } from '../services/forecast.js';
import { computeAllocationMetrics } from '../services/metrics.js';
import { loadReproducibilityReport } from '../services/report.js';

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ListOptions {
  allowedFilters: readonly string[];
  searchFields: readonly string[];
  allowedSorts?: readonly string[];
  defaultSort?: string;
  defaultOrder?: 'asc' | 'desc';
  defaultPageSize?: number;
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    handler(request, response, next).catch(next);
  };
}

function queryString(request: Request, key: string): string | undefined {
  const value = request.query[key];
  return typeof value === 'string' ? value : undefined;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, 'INVALID_QUERY', `Expected a positive integer, received: ${value}`);
  }
  return Math.min(parsed, maximum);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listQuery(request: Request, options: ListOptions): {
  filter: Record<string, unknown>;
  sort: string;
  order: 1 | -1;
  page: number;
  pageSize: number;
  search: string | undefined;
} {
  const filter: Record<string, unknown> = {};
  for (const field of options.allowedFilters) {
    const value = queryString(request, field);
    if (value !== undefined && value !== '') {
      filter[field] = value;
    }
  }

  const sort = queryString(request, 'sort') ?? options.defaultSort ?? '_id';
  const orderValue = queryString(request, 'order') ?? options.defaultOrder ?? 'asc';
  if (orderValue !== 'asc' && orderValue !== 'desc') {
    throw new HttpError(400, 'INVALID_QUERY', 'order must be asc or desc');
  }
  const allowedSorts = options.allowedSorts ?? options.searchFields;
  if (!allowedSorts.includes(sort) && sort !== '_id') {
    throw new HttpError(400, 'INVALID_QUERY', `Unsupported sort field: ${sort}`);
  }

  return {
    filter,
    sort,
    order: orderValue === 'asc' ? 1 : -1,
    page: positiveInteger(queryString(request, 'page'), 1, 1_000_000),
    pageSize: positiveInteger(
      queryString(request, 'pageSize'),
      options.defaultPageSize ?? 25,
      500,
    ),
    search: queryString(request, 'search'),
  };
}

async function sendList<T>(
  model: Model<T>,
  request: Request,
  response: Response,
  options: ListOptions,
): Promise<void> {
  const query = listQuery(request, options);
  const filter: Record<string, unknown> = { ...query.filter };
  if (query.search && query.search.trim() !== '') {
    const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = options.searchFields.map((field) => ({ [field]: pattern }));
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, data] = await Promise.all([
    model.countDocuments(filter).exec(),
    model
      .find(filter)
      .sort({ [query.sort]: query.order })
      .skip(skip)
      .limit(query.pageSize)
      .lean()
      .exec(),
  ]);

  const body: ListResponse<unknown> = {
    data,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
  response.json(body);
}

async function getForecastMetrics() {
  const [forecasts, interests] = await Promise.all([
    DemandForecastModel.find({ term: TARGET_TERM })
      .sort({ _id: 1 })
      .lean()
      .exec(),
    RegistrationInterestModel.find({
      term: { $in: [...HISTORY_TERMS, TARGET_TERM] },
    })
      .sort({ _id: 1 })
      .lean()
      .exec(),
  ]);
  return computeForecastMetrics(forecasts, interests, AS_OF);
}

async function getAllocationMetrics() {
  const [
    forecasts,
    sections,
    workloadAssignments,
    allocationDecisions,
    unmetDemands,
    faculty,
    facultySkills,
    rooms,
  ] = await Promise.all([
    DemandForecastModel.find({ term: TARGET_TERM }).lean().exec(),
    SectionModel.find({ term: TARGET_TERM }).lean().exec(),
    WorkloadAssignmentModel.find({ term: TARGET_TERM }).lean().exec(),
    AllocationDecisionModel.find({ term: TARGET_TERM }).lean().exec(),
    UnmetDemandModel.find({ term: TARGET_TERM }).lean().exec(),
    FacultyModel.find({}).lean().exec(),
    FacultySkillModel.find({}).lean().exec(),
    RoomModel.find({}).lean().exec(),
  ]);

  return computeAllocationMetrics(
    {
      forecasts,
      sections,
      workloadAssignments,
      allocationDecisions,
      unmetDemands,
      faculty,
      facultySkills,
      rooms,
    },
    AS_OF,
  );
}

function genericListOptions(name: CollectionName): ListOptions {
  const meta = SCHEMA[name];
  const filterFields = meta.fields
    .filter((field) => field.name !== '_id')
    .map((field) => field.name);
  const searchFields = meta.fields
    .filter((field) =>
      ['string', 'date', 'datetime'].includes(field.type),
    )
    .map((field) => field.name);
  return {
    allowedFilters: filterFields,
    searchFields,
    allowedSorts: meta.fields.map((field) => field.name),
    defaultSort: '_id',
    defaultPageSize: 25,
  };
}

export interface CreateAppOptions {
  reportsDir?: string;
  staticDir?: string;
  clientOrigin?: string;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();
  const reportsDir = options.reportsDir ?? join(process.cwd(), 'reports');

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: options.clientOrigin ?? config.clientOrigin,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  app.get(
    '/api/health',
    asyncHandler(async (_request, response) => {
      response.json({
        status: 'ok',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        target_term: TARGET_TERM,
      });
    }),
  );

  app.get(
    '/api/summary',
    asyncHandler(async (_request, response) => {
      const [counts, forecast, allocation, latestValidation, latestPipeline, reproducibility] =
        await Promise.all([
          countCollections(),
          getForecastMetrics(),
          getAllocationMetrics(),
          ValidationRunModel.findOne({}).sort({ _id: -1 }).lean().exec(),
          PipelineRunModel.findOne({}).sort({ _id: -1 }).lean().exec(),
          loadReproducibilityReport(reportsDir),
        ]);

      response.json({
        seed: latestPipeline?.seed ?? SEED,
        scale: latestPipeline?.scale ?? 'starter',
        as_of: AS_OF,
        target_term: TARGET_TERM,
        counts,
        validation: latestValidation ?? null,
        pipeline: latestPipeline ?? null,
        forecast,
        allocation,
        reproducibility,
      });
    }),
  );

  app.get(
    '/api/runs',
    asyncHandler(async (request, response) => {
      await sendList(PipelineRunModel, request, response, {
        allowedFilters: ['status', 'scale'],
        searchFields: ['_id', 'db_name', 'status'],
        defaultSort: '_id',
        defaultOrder: 'desc',
        defaultPageSize: 20,
      });
    }),
  );

  app.get(
    '/api/validation/latest',
    asyncHandler(async (_request, response) => {
      const run = await ValidationRunModel.findOne({}).sort({ _id: -1 }).lean().exec();
      response.json({ data: run ?? null });
    }),
  );

  app.get(
    '/api/validation',
    asyncHandler(async (request, response) => {
      await sendList(ValidationRunModel, request, response, {
        allowedFilters: ['status', 'scale'],
        searchFields: ['_id', 'run_id', 'status'],
        defaultSort: '_id',
        defaultOrder: 'desc',
        defaultPageSize: 20,
      });
    }),
  );

  app.get(
    '/api/programs',
    asyncHandler(async (request, response) => {
      await sendList(
        ProgramModel,
        request,
        response,
        {
          allowedFilters: ['department', 'degree_level', 'status'],
          searchFields: ['_id', 'program_code', 'program_name'],
        },
      );
    }),
  );

  app.get(
    '/api/courses',
    asyncHandler(async (request, response) => {
      await sendList(CourseModel, request, response, {
        allowedFilters: [
          'program_id',
          'department',
          'course_type',
          'course_level',
          'status',
          'term_offering',
        ],
        searchFields: ['_id', 'course_code', 'title'],
        allowedSorts: ['_id', 'course_code', 'title', 'course_level'],
        defaultPageSize: 50,
      });
    }),
  );

  app.get(
    '/api/courses/:id',
    asyncHandler(async (request, response) => {
      const course = await CourseModel.findOne({ _id: request.params.id }).lean().exec();
      if (!course) {
        throw new HttpError(404, 'NOT_FOUND', `Course not found: ${request.params.id}`);
      }
      const [prerequisites, forecast, sections] = await Promise.all([
        PrerequisiteModel.find({ course_id: course._id }).sort({ _id: 1 }).lean().exec(),
        DemandForecastModel.findOne({ course_id: course._id, term: TARGET_TERM })
          .lean()
          .exec(),
        SectionModel.find({ course_id: course._id, term: TARGET_TERM })
          .sort({ _id: 1 })
          .lean()
          .exec(),
      ]);
      response.json({ data: { course, prerequisites, forecast, sections } });
    }),
  );

  app.get(
    '/api/faculty',
    asyncHandler(async (request, response) => {
      await sendList(FacultyModel, request, response, {
        allowedFilters: ['department', 'employment_type', 'status'],
        searchFields: ['_id', 'display_name', 'email'],
        defaultPageSize: 50,
      });
    }),
  );

  app.get(
    '/api/faculty/:id',
    asyncHandler(async (request, response) => {
      const faculty = await FacultyModel.findOne({ _id: request.params.id }).lean().exec();
      if (!faculty) {
        throw new HttpError(404, 'NOT_FOUND', `Faculty not found: ${request.params.id}`);
      }
      const [skills, availabilities, assignments, decisions] = await Promise.all([
        FacultySkillModel.find({ faculty_id: faculty._id }).sort({ _id: 1 }).lean().exec(),
        AvailabilityModel.find({ faculty_id: faculty._id }).sort({ _id: 1 }).lean().exec(),
        WorkloadAssignmentModel.find({ faculty_id: faculty._id })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        AllocationDecisionModel.find({ faculty_id: faculty._id })
          .sort({ _id: 1 })
          .lean()
          .exec(),
      ]);
      response.json({
        data: { faculty, skills, availabilities, assignments, decisions },
      });
    }),
  );

  app.get(
    '/api/students',
    asyncHandler(async (request, response) => {
      await sendList(
        StudentModel,
        request,
        response,
        {
          allowedFilters: ['program_id', 'status', 'cohort_year'],
          searchFields: ['_id', 'display_name', 'email'],
        },
      );
    }),
  );

  app.get(
    '/api/plans',
    asyncHandler(async (request, response) => {
      await sendList(
        StudentPlanModel,
        request,
        response,
        {
          allowedFilters: ['student_id', 'course_id', 'term', 'status'],
          searchFields: ['_id', 'student_id', 'course_id'],
          defaultPageSize: 50,
        },
      );
    }),
  );

  app.get(
    '/api/interests',
    asyncHandler(async (request, response) => {
      await sendList(RegistrationInterestModel, request, response, {
        allowedFilters: ['term', 'course_id', 'student_id', 'interest_status', 'source'],
        searchFields: ['_id', 'course_id', 'student_id'],
        defaultPageSize: 50,
      });
    }),
  );

  app.get(
    '/api/forecasts',
    asyncHandler(async (request, response) => {
      await sendList(DemandForecastModel, request, response, {
        allowedFilters: ['term', 'course_id', 'confidence'],
        searchFields: ['_id', 'course_id', 'method'],
        allowedSorts: [
          '_id',
          'course_id',
          'forecast_enrollment',
          'weighted_average',
          'hist_demand_1',
          'hist_demand_2',
          'hist_demand_3',
        ],
        defaultSort: 'forecast_enrollment',
        defaultOrder: 'desc',
        defaultPageSize: 50,
      });
    }),
  );

  app.get(
    '/api/sections',
    asyncHandler(async (request, response) => {
      await sendList(SectionModel, request, response, {
        allowedFilters: [
          'term',
          'course_id',
          'status',
          'schedule_day',
          'delivery_mode',
          'room_id',
        ],
        searchFields: ['_id', 'course_id', 'room_id'],
        allowedSorts: ['_id', 'course_id', 'section_no', 'capacity', 'enrolled_count'],
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/sections/:id',
    asyncHandler(async (request, response) => {
      const section = await SectionModel.findOne({ _id: request.params.id }).lean().exec();
      if (!section) {
        throw new HttpError(404, 'NOT_FOUND', `Section not found: ${request.params.id}`);
      }
      const [assignments, decisions, course, room] = await Promise.all([
        WorkloadAssignmentModel.find({ section_id: section._id })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        AllocationDecisionModel.find({ section_id: section._id })
          .sort({ _id: 1 })
          .lean()
          .exec(),
        CourseModel.findOne({ _id: section.course_id }).lean().exec(),
        section.room_id
          ? RoomModel.findOne({ _id: section.room_id }).lean().exec()
          : Promise.resolve(null),
      ]);
      response.json({ data: { section, course, room, assignments, decisions } });
    }),
  );

  app.get(
    '/api/assignments',
    asyncHandler(async (request, response) => {
      await sendList(WorkloadAssignmentModel, request, response, {
        allowedFilters: ['term', 'faculty_id', 'section_id', 'status', 'assignment_role'],
        searchFields: ['_id', 'faculty_id', 'section_id'],
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/rooms',
    asyncHandler(async (request, response) => {
      await sendList(RoomModel, request, response, {
        allowedFilters: ['status', 'room_type', 'building'],
        searchFields: ['_id', 'building', 'room_number'],
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/unmet-demand',
    asyncHandler(async (request, response) => {
      await sendList(UnmetDemandModel, request, response, {
        allowedFilters: ['term', 'course_id', 'reason_code'],
        searchFields: ['_id', 'course_id', 'reason_code'],
        allowedSorts: ['_id', 'course_id', 'unmet_count', 'forecast_enrollment'],
        defaultSort: 'unmet_count',
        defaultOrder: 'desc',
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/decisions',
    asyncHandler(async (request, response) => {
      await sendList(AllocationDecisionModel, request, response, {
        allowedFilters: [
          'term',
          'section_id',
          'course_id',
          'faculty_id',
          'decision_type',
        ],
        searchFields: ['_id', 'section_id', 'course_id', 'faculty_id', 'rationale'],
        allowedSorts: ['_id', 'section_id', 'course_id', 'faculty_id', 'score'],
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/exceptions/ground-truth',
    asyncHandler(async (request, response) => {
      await sendList(GroundTruthAnomalyModel, request, response, {
        allowedFilters: ['issue_type', 'entity_type', 'severity', 'expected_rule'],
        searchFields: ['_id', 'entity_id', 'related_entity_id', 'expected_rule'],
        defaultPageSize: 100,
      });
    }),
  );

  app.get(
    '/api/metrics/forecast',
    asyncHandler(async (_request, response) => {
      response.json({ data: await getForecastMetrics() });
    }),
  );

  app.get(
    '/api/metrics/allocation',
    asyncHandler(async (_request, response) => {
      response.json({ data: await getAllocationMetrics() });
    }),
  );

  app.get(
    '/api/reproducibility',
    asyncHandler(async (_request, response) => {
      response.json({ data: await loadReproducibilityReport(reportsDir) });
    }),
  );

  app.get(
    '/api/schema',
    asyncHandler(async (_request, response) => {
      response.json({
        data: {
          schema: SCHEMA,
          business_rules: BUSINESS_RULES,
          collections: COLLECTION_NAMES,
          scales: SCALES,
          terms: TERM_CODES,
          term_dates: TERM_DATES,
          target_term: TARGET_TERM,
          history_terms: HISTORY_TERMS,
          as_of: AS_OF,
          seed: SEED,
        },
      });
    }),
  );

  app.get(
    '/api/collections',
    asyncHandler(async (_request, response) => {
      const counts = await countCollections();
      response.json({
        data: COLLECTION_NAMES.map((name) => ({
          name,
          description: SCHEMA[name].description,
          count: counts[name] ?? 0,
        })),
      });
    }),
  );

  app.get(
    '/api/collections/:name',
    asyncHandler(async (request, response) => {
      const name = request.params.name as CollectionName;
      if (!COLLECTION_NAMES.includes(name)) {
        throw new HttpError(404, 'NOT_FOUND', `Unknown collection: ${request.params.name}`);
      }
      const model = models[name];
      await sendList(model, request, response, genericListOptions(name));
    }),
  );

  app.use('/api', (_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'API route not found'));
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir));
    app.get('*', (request, response, next) => {
      if (request.path.startsWith('/api')) {
        next();
        return;
      }
      response.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      if (error instanceof HttpError) {
        response.status(error.status).json({
          error: { code: error.code, message: error.message, details: error.details },
        });
        return;
      }
      if (error instanceof mongoose.Error.CastError) {
        response.status(400).json({
          error: { code: 'INVALID_QUERY', message: error.message },
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown server error';
      console.error('[api] request failed:', error);
      response.status(500).json({
        error: { code: 'INTERNAL_ERROR', message },
      });
    },
  );

  return app;
}

export function resolveStaticDir(): string | undefined {
  const dir = join(process.cwd(), 'client', 'dist');
  return existsSync(dir) ? dir : undefined;
}

export function defaultScale(): ScaleName {
  return 'starter';
}

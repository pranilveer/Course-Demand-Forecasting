import type {
  AllocationMetrics,
  CollectionName,
  ForecastMetrics,
  ListResponse,
  PipelineRun,
  ReproducibilityReport,
  ValidationRun,
} from '@yottaflex/shared';

const API_BASE = '/api';

export interface SummaryResponse {
  seed: number;
  scale: string;
  as_of: string;
  target_term: string;
  counts: Record<string, number>;
  validation: ValidationRun | null;
  pipeline: PipelineRun | null;
  forecast: ForecastMetrics;
  allocation: AllocationMetrics;
  reproducibility: ReproducibilityReport | null;
}

export interface CollectionSummary {
  name: CollectionName;
  description: string;
  count: number;
}

export interface SchemaResponse {
  schema: Record<
    string,
    {
      name: string;
      description: string;
      fields: Array<{
        name: string;
        type: string;
        required: boolean;
        description: string;
        enum?: string[];
      }>;
    }
  >;
  business_rules: Array<{
    id: string;
    title: string;
    description: string;
    enforced_by: string[];
  }>;
  collections: CollectionName[];
  scales: Record<string, Record<string, number>>;
  terms: string[];
  target_term: string;
  history_terms: string[];
  as_of: string;
  seed: number;
}

export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await fetch(`${API_BASE}${path}${suffix}`);
  const body = (await response.json()) as T | { error?: { message?: string } };
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? body.error?.message ?? `Request failed: ${response.status}`
        : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function apiList<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<ListResponse<T>> {
  return apiGet<ListResponse<T>>(path, params);
}

export function apiData<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<{ data: T }> {
  return apiGet<{ data: T }>(path, params);
}

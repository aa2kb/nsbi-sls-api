import { asc, desc, eq, ne, gt, lt, gte, lte, like, and } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'like';

export interface FilterEntry {
  column: string;
  operator: FilterOperator;
  value: unknown;
}

export interface SortParam {
  column: string;
  direction: 'asc' | 'desc';
}

export interface ParsedQueryParams {
  page: number;
  limit: number;
  offset: number;
  sort: SortParam;
  filters: FilterEntry[];
}

export type QueryColumnMap = Record<string, AnyColumn>;

// ─── Internal ─────────────────────────────────────────────────────────────────

const VALID_OPERATORS = new Set<FilterOperator>(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'like']);

const OPERATOR_FNS = { eq, ne, gt, lt, gte, lte, like } as const;

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses standard listing query parameters from an API Gateway event.
 *
 * Supported params:
 *   ?page=1           — 1-based page number (default: 1)
 *   ?limit=250        — records per page, max 250 (default: 250)
 *   ?sort=col:dir     — column name and direction, e.g. createdAt:desc (default: createdAt:desc)
 *   ?filter=<json>    — URL-encoded JSON filter object (default: none)
 *
 * Filter JSON format:
 *   { "columnName": { "operator": "eq", "value": false } }
 *
 * Supported operators: eq, ne, gt, lt, gte, lte, like
 */
export function parseQueryParams(
  queryStringParameters: Record<string, string> | null | undefined,
  defaults: { page?: number; limit?: number; sort?: string } = {},
): ParsedQueryParams {
  const params = queryStringParameters ?? {};

  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 250;
  const defaultSort = defaults.sort ?? 'createdAt:desc';

  const page = Math.max(1, parseInt(params['page'] ?? String(defaultPage), 10) || defaultPage);
  const limit = Math.min(250, Math.max(1, parseInt(params['limit'] ?? String(defaultLimit), 10) || defaultLimit));
  const offset = (page - 1) * limit;

  const sortRaw = params['sort'] ?? defaultSort;
  const colonIdx = sortRaw.lastIndexOf(':');
  const sortColumn = colonIdx > 0 ? sortRaw.slice(0, colonIdx) : sortRaw;
  const sortDirRaw = colonIdx > 0 ? sortRaw.slice(colonIdx + 1) : 'desc';
  const direction: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';

  let filters: FilterEntry[] = [];
  if (params['filter']) {
    try {
      const filterObj = JSON.parse(params['filter']) as Record<string, { operator: string; value: unknown }>;
      filters = Object.entries(filterObj)
        .filter(([, config]) => config && typeof config === 'object')
        .map(([col, config]) => ({
          column: col,
          operator: VALID_OPERATORS.has(config.operator as FilterOperator)
            ? (config.operator as FilterOperator)
            : 'eq',
          value: config.value,
        }));
    } catch {
      // ignore unparseable filter — treat as no filter
    }
  }

  return {
    page,
    limit,
    offset,
    sort: { column: sortColumn, direction },
    filters,
  };
}

// ─── Drizzle Clause Builders ──────────────────────────────────────────────────

/**
 * Converts a parsed sort param into a Drizzle ORDER BY expression.
 * Returns undefined when the column name is not found in columnMap.
 */
export function buildOrderBy(sort: SortParam, columnMap: QueryColumnMap): SQL<unknown> | undefined {
  const col = columnMap[sort.column];
  if (!col) return undefined;
  return sort.direction === 'asc' ? asc(col) : desc(col);
}

/**
 * Converts parsed filter entries into Drizzle SQL conditions.
 * Silently skips entries whose column name is not in columnMap.
 */
export function buildWhereConditions(filters: FilterEntry[], columnMap: QueryColumnMap): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  for (const filter of filters) {
    const col = columnMap[filter.column];
    if (!col) continue;

    const opFn = OPERATOR_FNS[filter.operator];
    if (opFn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions.push((opFn as any)(col, filter.value));
    }
  }

  return conditions;
}

/**
 * Combines filter entries into a single Drizzle WHERE clause using AND.
 * Returns undefined when there are no filters (omits the WHERE clause entirely).
 */
export function buildWhereClause(filters: FilterEntry[], columnMap: QueryColumnMap): SQL<unknown> | undefined {
  const conditions = buildWhereConditions(filters, columnMap);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

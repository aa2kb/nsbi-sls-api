# Query Parameters — Listing Endpoints

All `GET` listing endpoints in this API support a standard set of query parameters for pagination, sorting, and filtering. The logic lives in **`src/utils/query-params.ts`** and must be used by every listing handler.

---

## Parameters

### `page` — Pagination (page number)

| Detail | Value |
|--------|-------|
| Type | integer |
| Default | `1` |
| Min | `1` |

Controls which page of results to return.

```
GET /meetings?page=2
```

---

### `limit` — Pagination (page size)

| Detail | Value |
|--------|-------|
| Type | integer |
| Default | `250` |
| Min | `1` |
| Max | `250` |

Controls how many records are returned per page. Values above `250` are silently clamped to `250`.

```
GET /meetings?limit=25
```

---

### `sort` — Sorting

| Detail | Value |
|--------|-------|
| Type | string |
| Default | `createdAt:desc` |
| Format | `columnName:direction` |
| Directions | `asc`, `desc` |

Sort by any column exposed in the endpoint's column map. The column name is the **API-facing name** (camelCase), not the database column name.

```
GET /meetings?sort=title:asc
GET /meetings?sort=date:desc
GET /meetings?sort=createdAt:asc
```

If the column name is unrecognised, the default sort (`createdAt:desc`) is applied silently.

---

### `filter` — Filtering

| Detail | Value |
|--------|-------|
| Type | URL-encoded JSON string |
| Default | none (no filtering) |

Pass a JSON object where each key is a column name and the value is a filter descriptor with `operator` and `value`.

#### Format

```json
{
  "columnName": {
    "operator": "eq",
    "value": false
  }
}
```

URL-encoded on the wire:
```
GET /meetings?filter=%7B%22participantsProcessed%22%3A%7B%22operator%22%3A%22eq%22%2C%22value%22%3Afalse%7D%7D
```

#### Supported Operators

| Operator | SQL Equivalent | Use for |
|----------|---------------|---------|
| `eq` | `=` | Exact match (boolean, number, string) |
| `ne` | `!=` | Exclude a specific value |
| `gt` | `>` | Greater than (numbers, dates) |
| `lt` | `<` | Less than (numbers, dates) |
| `gte` | `>=` | Greater than or equal |
| `lte` | `<=` | Less than or equal |
| `like` | `LIKE` | Pattern match — use `%` as wildcard (strings only) |

#### Multiple Filters

Multiple keys in the filter object are combined with `AND`:

```json
{
  "participantsProcessed": { "operator": "eq", "value": true },
  "dataProcessed":          { "operator": "eq", "value": false }
}
```

> **Note:** JSON object keys must be unique. To filter the same column multiple times (e.g. a range), use `gt` and `lte` in separate keys — which is not possible with duplicate keys. For range queries, add dedicated query params at the endpoint level.

---

## Pagination Response Envelope

Every listing response wraps results in a `data` object with a `pagination` block:

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": {
    "resources": [...],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 51,
      "totalPages": 3,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `page` | Current page number |
| `limit` | Page size used for this request |
| `total` | Total number of matching records (respects active filters) |
| `totalPages` | `Math.ceil(total / limit)` |
| `hasNext` | `page < totalPages` |
| `hasPrevious` | `page > 1` |

---

## Available Columns per Endpoint

### `GET /tasks`

| API column name | DB column | Type |
|----------------|-----------|------|
| `createdAt` | `created_at` | timestamp |
| `updatedAt` | `updated_at` | timestamp |
| `completedAt` | `completed_at` | timestamp (nullable) |
| `complete` | `complete` | boolean |
| `meetingId` | `meeting_id` | string |
| `participantId` | `participant_id` | uuid |

---

### `GET /meetings`

| API column name | DB column | Type |
|----------------|-----------|------|
| `createdAt` | `synced_at` (alias) | timestamp |
| `syncedAt` | `synced_at` | timestamp |
| `title` | `title` | string |
| `date` | `date` | bigint (unix ms) |
| `duration` | `duration` | float |
| `hostEmail` | `host_email` | string |
| `organizerEmail` | `organizer_email` | string |
| `calendarType` | `calendar_type` | string |
| `participantsProcessed` | `participants_processed` | boolean |
| `dataProcessed` | `data_processed` | boolean |
| `taskProcessed` | `task_processed` | boolean |
| `usersProcessed` | `users_processed` | boolean |
| `attemptsMade` | `attempts_made` | integer |

---

## Adding Query Params to a New Endpoint

### 1. Parse params in the handler

```typescript
import { parseQueryParams } from '../../utils/query-params.js';

export const handler = async (event: APIGatewayProxyEvent) => {
  const params = parseQueryParams(event.queryStringParameters);
  // params.page, params.limit, params.offset, params.sort, params.filters
};
```

### 2. Define a column map in the service

```typescript
import type { QueryColumnMap } from '../../utils/query-params.js';
import { buildOrderBy, buildWhereClause } from '../../utils/query-params.js';
import { myTable } from '../../db/schema.js';

const COLUMN_MAP: QueryColumnMap = {
  createdAt: myTable.createdAt,
  name:      myTable.name,
  status:    myTable.status,
};
```

### 3. Apply to the Drizzle query

```typescript
import { count, desc } from 'drizzle-orm';

export async function listResources(params: ParsedQueryParams) {
  const { page, limit, offset, sort, filters } = params;

  const orderBy    = buildOrderBy(sort, COLUMN_MAP) ?? desc(myTable.createdAt);
  const whereClause = buildWhereClause(filters, COLUMN_MAP);

  const [rows, countResult] = await Promise.all([
    db.select().from(myTable).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(myTable).where(whereClause),
  ]);

  const total      = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    resources: rows,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  };
}
```

### 4. Expose filterable columns in the endpoint's docs

Document the `Available Columns` table in `docs/QUERY_PARAMS.md` and `docs/LAMBDA_FUNCTIONS.md`.

# API Query Parameters — Frontend Reference

This document describes all query parameters supported by the NSBI API. Use it when building requests from the frontend.

**Base URL:** `https://<api-id>.execute-api.us-east-1.amazonaws.com/<stage>`  
**Auth:** All requests require `x-api-key: <your-api-key>` header.

---

## Endpoints Overview

| Endpoint | Method | Query Params |
|----------|--------|--------------|
| `/tasks` | GET | `page`, `limit`, `sort`, `filter` |
| `/meetings` | GET | `page`, `limit`, `sort`, `filter` |
| `/users` | GET | None (returns all users) |
| `/meetings/fetch` | GET | `fromDate`, `userId` (optional) |

---

## Standard Params (Tasks & Meetings)

These params apply to **`GET /tasks`** and **`GET /meetings`**.

### `page` — Page number

| Type | Default | Min |
|------|---------|-----|
| integer | `1` | `1` |

```
?page=2
```

---

### `limit` — Results per page

| Type | Default | Min | Max |
|------|---------|-----|-----|
| integer | `250` | `1` | `250` |

Values above 250 are clamped to 250.

```
?limit=25
```

---

### `sort` — Sort order

| Type | Default | Format |
|------|---------|--------|
| string | `createdAt:desc` | `columnName:direction` |

**Directions:** `asc`, `desc`

```
?sort=title:asc
?sort=date:desc
?sort=createdAt:asc
```

Use column names from the endpoint’s sortable columns (see below). Invalid columns fall back to `createdAt:desc`.

---

### `filter` — Filter results

| Type | Default | Format |
|------|---------|--------|
| URL-encoded JSON | none | `{"columnName":{"operator":"...","value":...}}` |

**Operators:**

| Operator | Use for |
|----------|---------|
| `eq` | Exact match (string, number, boolean) |
| `ne` | Not equal |
| `gt` | Greater than |
| `lt` | Less than |
| `gte` | Greater than or equal |
| `lte` | Less than or equal |
| `like` | Pattern match — use `%` as wildcard (strings only) |

**Multiple filters** are combined with AND.

**Example filter object:**
```json
{
  "complete": { "operator": "eq", "value": false },
  "meetingId": { "operator": "eq", "value": "01KKC379CPB2NX9VQJ41WV18N9" }
}
```

URL-encode before sending:
```
?filter=%7B%22complete%22%3A%7B%22operator%22%3A%22eq%22%2C%22value%22%3Afalse%7D%7D
```

---

## GET /tasks

**Sortable / filterable columns:**

| Column | Type | Example |
|--------|------|---------|
| `createdAt` | timestamp | `2026-03-14T10:00:00.000Z` |
| `updatedAt` | timestamp | `2026-03-14T10:00:00.000Z` |
| `completedAt` | timestamp (nullable) | `null` or ISO string |
| `complete` | boolean | `true`, `false` |
| `meetingId` | string | `01KKC379CPB2NX9VQJ41WV18N9` |
| `participantId` | uuid | `896b2358-299d-44c6-93b0-555fbd1d4114` |

**Example requests:**
```
# Incomplete tasks only
GET /tasks?filter={"complete":{"operator":"eq","value":false}}

# Tasks for a specific meeting
GET /tasks?filter={"meetingId":{"operator":"eq","value":"01KKC379CPB2NX9VQJ41WV18N9"}}

# Tasks for a specific participant
GET /tasks?filter={"participantId":{"operator":"eq","value":"896b2358-299d-44c6-93b0-555fbd1d4114"}}

# Paginated, sorted by completion date (newest first)
GET /tasks?page=1&limit=25&sort=completedAt:desc

# Combine filters
GET /tasks?filter={"complete":{"operator":"eq","value":false},"meetingId":{"operator":"eq","value":"01KKC379CPB2NX9VQJ41WV18N9"}}
```

**JavaScript example:**
```javascript
const params = new URLSearchParams({
  page: '1',
  limit: '25',
  sort: 'createdAt:desc',
  filter: JSON.stringify({ complete: { operator: 'eq', value: false } })
});
const url = `${baseUrl}/tasks?${params}`;
```

---

## GET /meetings

**Sortable / filterable columns:**

| Column | Type | Example |
|--------|------|---------|
| `createdAt` | timestamp (alias for syncedAt) | `2026-03-14T10:00:00.000Z` |
| `syncedAt` | timestamp | `2026-03-14T10:00:00.000Z` |
| `title` | string | `"Weekly Sync"` |
| `date` | bigint (unix ms) | `1741564800000` |
| `duration` | float | `37.26` |
| `hostEmail` | string | `"host@example.com"` |
| `organizerEmail` | string | `"organizer@example.com"` |
| `calendarType` | string | `"google"` |
| `participantsProcessed` | boolean | `true`, `false` |
| `dataProcessed` | boolean | `true`, `false` |
| `taskProcessed` | boolean | `true`, `false` |
| `usersProcessed` | boolean | `true`, `false` |
| `attemptsMade` | integer | `0`, `1`, `2` |

**Example requests:**
```
# Unprocessed meetings (participants not yet processed)
GET /meetings?filter={"participantsProcessed":{"operator":"eq","value":false}}

# Meetings needing data processing
GET /meetings?filter={"dataProcessed":{"operator":"eq","value":false}}

# Search by title (partial match)
GET /meetings?filter={"title":{"operator":"like","value":"%Weekly%"}}

# Sort by date (newest first)
GET /meetings?sort=date:desc&limit=50

# Multiple filters (AND)
GET /meetings?filter={"participantsProcessed":{"operator":"eq","value":true},"taskProcessed":{"operator":"eq","value":false}}
```

**JavaScript example:**
```javascript
const params = new URLSearchParams({
  page: '1',
  limit: '50',
  sort: 'date:desc',
  filter: JSON.stringify({
    participantsProcessed: { operator: 'eq', value: false }
  })
});
const url = `${baseUrl}/meetings?${params}`;
```

---

## GET /meetings/fetch

Triggers a sync of meetings from Fireflies. Optional query params:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `fromDate` | ISO 8601 string | last sync date or `2026-02-27` | Fetch transcripts from this date |
| `userId` | string | — | Filter by Fireflies user ID |

**Example:**
```
GET /meetings/fetch?fromDate=2026-03-01T00:00:00.000Z
```

---

## Response Shape (Tasks & Meetings)

All listing responses use this structure:

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": {
    "tasks": [...],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 84,
      "totalPages": 4,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

For `/meetings`, the key is `meetings` instead of `tasks`.

| Pagination field | Description |
|------------------|-------------|
| `page` | Current page (1-based) |
| `limit` | Page size used |
| `total` | Total matching records (with filters applied) |
| `totalPages` | `ceil(total / limit)` |
| `hasNext` | `page < totalPages` |
| `hasPrevious` | `page > 1` |

---

## GET /users

No query parameters. Returns all users ordered by `createdAt`. No pagination.

---

## Quick Reference

| Endpoint | Params | Pagination |
|----------|--------|------------|
| `GET /tasks` | `page`, `limit`, `sort`, `filter` | Yes |
| `GET /meetings` | `page`, `limit`, `sort`, `filter` | Yes |
| `GET /users` | — | No |
| `GET /meetings/fetch` | `fromDate`, `userId` | No |

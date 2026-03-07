# Lambda Functions

All Lambda functions in this project are HTTP-triggered via AWS API Gateway. Every endpoint requires an API key (`x-api-key` header).

**Global configuration** (applies to all functions unless overridden):

| Setting | Value |
|---------|-------|
| Runtime | `nodejs22.x` |
| Memory | 1024 MB |
| Timeout | 30 seconds |
| Region | `us-east-1` |
| Log retention | 7 days |
| Auth | API Key (`private: true`) |

---

## `helloWorld`

**File:** `src/lambda/hello/hello.ts`
**Trigger:** `GET /hello`

### Purpose
Health-check / smoke-test endpoint. Confirms the API is reachable and returns the current stage and timestamp.

### Response
```json
{
  "message": "Hello from NSBI API!",
  "stage": "dev",
  "timestamp": "2026-03-07T12:00:00.000Z",
  "path": "/hello"
}
```

### Notes
- No database connection — stateless and fast
- Useful for confirming a successful deployment

---

## `listUsers`

**File:** `src/lambda/users/list-users.ts`
**Trigger:** `GET /users`

### Purpose
Returns a list of users from the database.

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Results per page (max 100) |

### Response
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "createdAt": "2026-03-07T12:00:00.000Z",
        "updatedAt": "2026-03-07T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5,
      "hasNext": true,
      "hasPrevious": false
    }
  }
}
```

### Business Logic Location
`src/lambda/users/list-users.ts` (to be extracted to `src/services/users/user-service.ts`)

---

## `createUser`

**File:** `src/lambda/users/create-user.ts`
**Trigger:** `POST /users`

### Purpose
Creates a new user record in the database. Validates input with Zod and handles duplicate email conflicts.

### Request Body
```json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Validation Rules
- `name` — required, non-empty string
- `email` — required, valid email format

### Response — Success (`201`)
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "createdAt": "2026-03-07T12:00:00.000Z",
      "updatedAt": "2026-03-07T12:00:00.000Z"
    }
  }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `400` | Validation error (missing/invalid fields) |
| `409` | Email already exists (PostgreSQL `23505` unique constraint) |
| `500` | Unexpected server error |

### Business Logic Location
`src/lambda/users/create-user.ts` (to be extracted to `src/services/users/user-service.ts`)

---

## `fetchMeetings`

**File:** `src/lambda/meetings/fetch-meetings.ts`
**Trigger:** `GET /meetings/fetch` + EventBridge schedule (`rate(1 day)`)

### Purpose
Fetches meeting transcripts from the Fireflies.ai GraphQL API. Supports both on-demand HTTP requests and a daily automated sync via EventBridge.

### Query Parameters (HTTP only)
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `fromDate` | ISO 8601 string | `2026-02-27T00:00:00.000Z` | Fetch transcripts from this date |
| `userId` | string | — | Filter by a specific Fireflies user ID |

### Response — Success (`200`)
```json
{
  "success": true,
  "message": "Meetings fetched successfully",
  "data": {
    "meetings": [...],
    "count": 5
  }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `500` | Fireflies API error or missing `FIREFLIES_API_KEY` |

### Environment Variables
| Variable | Description |
|----------|-------------|
| `FIREFLIES_API_KEY` | Bearer token for Fireflies.ai GraphQL API |

### Business Logic Location
`src/services/meetings/meeting-service.ts`

### Notes
- Uses `graphql-request` to call `https://api.fireflies.ai/graphql`
- On scheduled invocation the handler logs results but returns no HTTP response
- Schedule fires once per day (`rate(1 day)`) via EventBridge

---

## Adding a New Lambda Function

1. Create `src/lambda/<group>/<trigger>.ts` with a single exported `handler`
2. Register it in `serverless.yml` under `functions:`
3. Add an entry to this file (`docs/LAMBDA_FUNCTIONS.md`)
4. Add/update the API endpoint in `docs/API_REFERENCE.md`
5. Use `buildResponse` from `src/utils/response.ts` for all responses

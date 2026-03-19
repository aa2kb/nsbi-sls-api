# Lambda Functions

All Lambda functions are HTTP-triggered via AWS API Gateway. Every endpoint requires an API key (`x-api-key` header).

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

## `healthCheck`

**File:** `src/lambda/health/health.ts`
**Trigger:** `GET /health`

### Purpose
Health-check endpoint. Confirms the API is reachable and returns the current stage and timestamp.

### Response
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "status": "ok",
    "stage": "dev",
    "timestamp": "2026-03-07T12:00:00.000Z",
    "path": "/health"
  }
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

## `listTasks`

**File:** `src/lambda/tasks/list-tasks.ts`
**Trigger:** `GET /tasks`

### Purpose
Returns a paginated, sortable, and filterable list of tasks. Each task is enriched with its related participant, the user linked to that participant (if any), and the meeting it belongs to.

### Join Chain
```
tasks
├── INNER JOIN meeting_participants  (tasks.participant_id)
│       └── LEFT JOIN users          (meeting_participants.user_id — nullable)
└── INNER JOIN meetings              (tasks.meeting_id)
```

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `100` | Results per page (max 100) |
| `sort` | string | `createdAt:desc` | Column and direction |
| `filter` | JSON string | none | Column filter object |

#### Filterable / Sortable Columns
`createdAt`, `updatedAt`, `completedAt`, `complete`, `meetingId`, `participantId`

### Response — Success (`200`)
```json
{
  "success": true,
  "message": "Tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": "uuid",
        "taskTitle": "Follow up with client",
        "taskDescription": "Send the proposal by Friday",
        "complete": false,
        "createdAt": "2026-03-14T10:00:00.000Z",
        "updatedAt": "2026-03-14T10:00:00.000Z",
        "completedAt": null,
        "participant": {
          "id": "uuid",
          "speakerName": "Brandon Conyers"
        },
        "user": {
          "id": "uuid",
          "name": "Brandon Conyers",
          "email": "bconyers@nsbi.net"
        },
        "meeting": {
          "id": "01KKC379CPB2NX9VQJ41WV18N9",
          "title": "Weekly Sync",
          "date": 1741564800000,
          "dateString": "2026-03-10",
          "hostEmail": null,
          "organizerEmail": "bconyers@nsbi.net"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 84,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

### Notes
- `user` fields (`id`, `name`, `email`) will be `null` when the participant has not been linked to a user yet (i.e. `process-users` has not run for that meeting)
- `complete` filter example: `?filter={"complete":{"operator":"eq","value":false}}`

### Error Responses
| Status | Condition |
|--------|-----------|
| `500` | Database error or unexpected server error |

### Business Logic Location
`src/services/tasks/list-tasks-service.ts`

---

## `listMeetings`

**File:** `src/lambda/meetings/list-meetings.ts`
**Trigger:** `GET /meetings`

### Purpose
Returns a paginated, sortable, and filterable list of meetings from the database.

### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | 1-based page number |
| `limit` | number | `100` | Records per page (max 100) |
| `sort` | string | `createdAt:desc` | Sort column and direction — e.g. `title:asc`, `date:desc` |
| `filter` | JSON string | none | URL-encoded JSON filter object (see below) |

#### Sortable columns
`createdAt` (alias for `syncedAt`), `syncedAt`, `title`, `date`, `duration`, `hostEmail`, `organizerEmail`, `calendarType`, `participantsProcessed`, `dataProcessed`, `taskProcessed`, `usersProcessed`, `attemptsMade`

#### Filter format
Pass a URL-encoded JSON object where each key is a column name:
```json
{
  "participantsProcessed": { "operator": "eq", "value": false },
  "dataProcessed": { "operator": "eq", "value": true }
}
```
Supported operators: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `like`

### Response — Success (`200`)
```json
{
  "success": true,
  "message": "Meetings retrieved successfully",
  "data": {
    "meetings": [
      {
        "id": "01KKC379CPB2NX9VQJ41WV18N9",
        "title": "Weekly Sync",
        "hostEmail": "host@example.com",
        "participantsProcessed": false,
        "dataProcessed": true,
        "syncedAt": "2026-03-14T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 42,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `500` | Database error or unexpected server error |

### Business Logic Location
`src/services/meetings/list-meetings-service.ts`

### Reusable Utilities
`src/utils/query-params.ts` — `parseQueryParams`, `buildOrderBy`, `buildWhereClause`, `buildWhereConditions`
These can be used by any other listing endpoint.

---

## `meetingWebhook`

**File:** `src/lambda/meetings/meeting-webhook.ts`
**Trigger:** `POST /meetings/webhook`

### Purpose
Receives webhook callbacks for meeting events (e.g. from Fireflies.ai). On each request, calls `syncMeetings()` — the same function used by `fetchMeetings` — to fetch, upsert, and publish meetings. No API key required (`private: false`) so external services can call it.

### Request
- Method: `POST`
- Body: JSON (e.g. `{ "meetingId": "...", "eventType": "Transcription completed" }` — logged for debugging)

### Response — Success (`200`)
```json
{
  "success": true,
  "message": "Meetings synced — X saved, Y queued",
  "data": {
    "saved": 0,
    "fetched": 0,
    "snsPublished": 0,
    "fromDate": "...",
    "latestMeetingDate": "..."
  }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `500` | Fireflies API error or internal error |

### Business Logic Location
`src/services/meetings/meeting-service.ts` — `syncMeetings`

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

## `processParticipants`

**File:** `src/lambda/meetings/process-participants.ts`
**Trigger:** `GET /meetings/{id}/process-participants`

### Purpose
Reads the `analytics.speakers` array from a stored meeting record and creates a `meeting_participants` row for each speaker. When speaker names are generic (e.g. `Speaker 1`, `Speaker 2`), real names are inferred from the meeting title using the pattern `Name [info] <> Name [info]`. Segments that resolve to bare phone numbers are kept as the original generic label. Duplicate participants (same name + meeting) are silently skipped via a unique constraint.

### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Meeting ID from the `meetings` table |

### Response — Success (`200`)
```json
{
  "success": true,
  "message": "Participants processed — 2 created, 0 already existed",
  "data": {
    "created": 2,
    "skipped": 0,
    "participants": ["Brandon Conyers", "Jake Priszner"]
  }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `400` | Missing `id` path parameter |
| `404` | Meeting not found |
| `500` | Unexpected server error |

### Business Logic Location
`src/services/meetings/participant-service.ts`

### Notes
- Idempotent — safe to call multiple times; existing participants are skipped
- Name resolution order: analytics speaker name → title extraction → original generic name
- Title parsing handles: `Name [info] <> Name [info]` and bare phone numbers on either side

---

## `processData`

**File:** `src/lambda/meetings/process-data.ts`
**Trigger:** `POST /meetings/{id}/process-data`

### Purpose
Downloads the full meeting transcript from the Fireflies.ai GraphQL API and persists it to S3. Also streams the meeting audio to S3. Marks the meeting as `data_processed = true` in the database so subsequent calls return immediately without re-fetching.

### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Meeting ID from the `meetings` table |

### Response — Success, first call (`200`)
```json
{
  "success": true,
  "message": "Data saved to s3://nsbi-meetings/{id}/data.json. Audio saved to s3://nsbi-meetings/{id}/audio.mp3",
  "data": {
    "alreadyProcessed": false,
    "dataKey": "{id}/data.json",
    "audioKey": "{id}/audio.mp3",
    "audioSkipped": false
  }
}
```

### Response — Already processed (`200`)
```json
{
  "success": true,
  "message": "Already processed",
  "data": { "alreadyProcessed": true }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `400` | Missing `id` path parameter |
| `404` | Meeting not found in the database |
| `500` | Fireflies API error, S3 upload failure, or missing env vars |

### S3 Layout
| Object | Path |
|--------|------|
| Full transcript JSON | `s3://nsbi-meetings/{id}/data.json` |
| Meeting audio MP3 | `s3://nsbi-meetings/{id}/audio.mp3` |

### Environment Variables
| Variable | Description |
|----------|-------------|
| `FIREFLIES_API_KEY` | Bearer token for Fireflies.ai GraphQL API |
| `MEETINGS_BUCKET` | S3 bucket name (`nsbi-meetings`) |

### Business Logic Location
`src/services/meetings/process-data-service.ts`

### Notes
- Idempotent — safe to call multiple times; subsequent calls return `alreadyProcessed: true` instantly
- Audio upload is streamed directly (no buffering) using `fetch` + AWS SDK v3 streaming body
- If `audio_url` is absent or the download fails, audio is skipped and `audioSkipped: true` is returned
- Timeout is 300 seconds (5 minutes) to accommodate large audio uploads
- Requires the `nsbi-meetings` S3 bucket to exist in `us-east-1`

---

## `processTasks`

**File:** `src/lambda/meetings/process-tasks.ts`
**Trigger:** `POST /meetings/{id}/process-tasks`

### Purpose
Reads the full meeting transcript from S3, extracts participant names from the `meeting_participants` table, and uses AWS Bedrock (Claude) to generate a list of actionable tasks for each participant. Tasks are persisted to the `tasks` table and the meeting is marked as `task_processed = true`.

### Prerequisites
The meeting must have both flags set before this endpoint will proceed:
- `participantsProcessed = true` — participants have been extracted
- `dataProcessed = true` — transcript JSON has been uploaded to S3

### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Meeting ID from the `meetings` table |

### Response — Success, first call (`200`)
```json
{
  "success": true,
  "message": "Tasks processed — 4 task(s) created",
  "data": {
    "alreadyProcessed": false,
    "tasksCreated": 4
  }
}
```

### Response — Already processed (`200`)
```json
{
  "success": true,
  "message": "Tasks already processed",
  "data": { "alreadyProcessed": true }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `400` | Missing `id` path parameter |
| `404` | Meeting not found in the database |
| `422` | `participantsProcessed` or `dataProcessed` is not yet `true` |
| `500` | S3 read failure, Bedrock error, DB error, or missing env vars |

### Environment Variables
| Variable | Description |
|----------|-------------|
| `MEETINGS_BUCKET` | S3 bucket containing `{id}/data.json` |

### Business Logic Location
`src/services/meetings/process-tasks-service.ts`

### Notes
- Idempotent — subsequent calls return `alreadyProcessed: true` instantly
- The LLM prompt instructs Claude to only create tasks for participants with clear action items in the transcript
- Each participant may have multiple tasks; tasks whose participant name cannot be matched are silently skipped
- Timeout is 300 seconds to accommodate Bedrock invocation latency
- Bedrock model: `anthropic.claude-3-5-haiku-20241022-v1:0`

---

## `processUsers`

**File:** `src/lambda/meetings/process-users.ts`
**Trigger:** `POST /meetings/{id}/process-users`

### Purpose
Takes the email list stored in `meeting.participants`, upserts a `users` row for each unique email, then uses AWS Bedrock (Claude) to fuzzy-match each email to its corresponding `meeting_participants` speaker name. Once a match is found the `meeting_participants.user_id` FK is updated to link the two records. Marks the meeting as `users_processed = true` when done.

### Prerequisites
- `participants` column on the meeting must contain an array of email strings (populated when the meeting is fetched)
- `process-participants` should have run so `meeting_participants` rows exist for accurate name-to-email linking (not strictly required — users will still be created even without speaker rows)

### Path Parameters
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Meeting ID from the `meetings` table |

### Response — Success, first call (`200`)
```json
{
  "success": true,
  "message": "Users processed — 2 user(s) created, 2 participant(s) linked",
  "data": {
    "alreadyProcessed": false,
    "usersCreated": 2,
    "usersMatched": 2,
    "matches": [
      { "email": "bconyers@nsbi.net", "speakerName": "Brandon Conyers", "userId": "uuid" },
      { "email": "jpriszner@nsbi.net", "speakerName": "Jake Priszner", "userId": "uuid" }
    ]
  }
}
```

### Response — Already processed (`200`)
```json
{
  "success": true,
  "message": "Users already processed",
  "data": { "alreadyProcessed": true }
}
```

### Error Responses
| Status | Condition |
|--------|-----------|
| `400` | Missing `id` path parameter |
| `404` | Meeting not found in the database |
| `422` | `meeting.participants` is empty — no emails to process |
| `500` | Bedrock error, DB error, or missing env vars |

### Business Logic Location
`src/services/meetings/process-users-service.ts`

### Notes
- Idempotent — subsequent calls return `alreadyProcessed: true` instantly
- User upsert is by email — if a user already exists with that email, no duplicate is created
- LLM matching uses the email prefix (e.g. `bconyers` → `Brandon Conyers`) as the primary matching signal
- If the LLM cannot match an email to a speaker, `speakerName` is `null` and the user is still created (no participant link set)
- Timeout is 300 seconds to accommodate Bedrock invocation latency
- Bedrock model: `us.anthropic.claude-sonnet-4-6`

---

## `processPipeline`

**File:** `src/lambda/meetings/process-pipeline.ts`
**Triggers:**
- SNS topic `nsbi-meeting-pipeline-{stage}` (primary)
- `POST /meetings/{id}/process-pipeline` (HTTP, for local testing)

### Purpose
Runs the full meeting processing pipeline in sequence for a given meeting ID:
1. **processData** — fetch transcript + audio from Fireflies, save to S3
2. **processParticipants** — extract speakers → `meeting_participants` rows
3. **processTasks** — LLM task extraction → `tasks` rows
4. **processUsers** — email → user upsert + participant linking via LLM match

Each step is idempotent — if a step was already completed it is skipped automatically.

### SNS Message Format
Publish either a plain meeting ID string or a JSON object:
```
01KKC379CPB2NX9VQJ41WV18N9
```
```json
{ "meetingId": "01KKC379CPB2NX9VQJ41WV18N9" }
```

### Path Parameters (HTTP only)
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Meeting ID from the `meetings` table |

### Response — HTTP Success (`200`)
```json
{
  "success": true,
  "message": "Pipeline completed for meeting 01KKC379CPB2NX9VQJ41WV18N9",
  "data": {
    "meetingId": "01KKC379CPB2NX9VQJ41WV18N9",
    "steps": {
      "processData":        { "skipped": false, "alreadyProcessed": false, "dataKey": "...", "audioKey": "..." },
      "processParticipants":{ "skipped": false, "created": 2, "skipped": 0 },
      "processTasks":       { "skipped": false, "alreadyProcessed": false, "tasksCreated": 8 },
      "processUsers":       { "skipped": false, "alreadyProcessed": false, "usersCreated": 2, "usersMatched": 2 }
    }
  }
}
```

### Error Responses (HTTP)
| Status | Condition |
|--------|-----------|
| `400` | Missing `id` path parameter |
| `500` | Any step fails — error message returned |

### SNS Error Behaviour
If any step throws the error is re-thrown so Lambda marks the delivery as failed, enabling retries and DLQ routing.

### SNS Topic
| Resource | Value |
|----------|-------|
| CloudFormation logical ID | `MeetingPipelineTopic` |
| Topic name | `nsbi-meeting-pipeline-{stage}` |

### Business Logic Location
`src/services/meetings/process-pipeline-service.ts`

### Notes
- Timeout is 900 seconds (15 min) to cover all four Bedrock + S3 + DB steps
- Safe to trigger multiple times — each individual step checks its own `*_processed` flag and skips if already done

---

## Adding a New Lambda Function

1. Create `src/lambda/<group>/<trigger>.ts` with a single exported `handler`
2. Register it in `serverless.yml` under `functions:`
3. Add an entry to this file (`docs/LAMBDA_FUNCTIONS.md`)
4. Add/update the API endpoint in `docs/API_REFERENCE.md`
5. Use `buildResponse` from `src/utils/response.ts` for all responses

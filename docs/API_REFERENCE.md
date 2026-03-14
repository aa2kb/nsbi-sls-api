# API Reference

## Authentication

All endpoints require an API key passed in the `x-api-key` header.

```
x-api-key: <your-api-key>
```

API keys are provisioned per stage: `nsbi-api-key-dev`, `nsbi-api-key-prod`.

**Throttle limits:** 100 requests/second, burst of 200.

---

## Base URL

| Stage | Base URL |
|-------|----------|
| `dev` | `https://<api-id>.execute-api.us-east-1.amazonaws.com/dev` |
| `prod` | `https://<api-id>.execute-api.us-east-1.amazonaws.com/prod` |

Local (offline): `http://localhost:3000`

---

## Standard Response Envelope

All responses follow this structure:

```json
{
  "success": true,
  "message": "Human-readable status message",
  "data": {}
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description",
  "data": {
    "error": "Detailed error message"
  }
}
```

---

## Endpoints

### `GET /hello`

Health-check endpoint. No authentication required for testing but API key is still enforced.

**Response `200`**
```json
{
  "message": "Hello from NSBI API!",
  "stage": "dev",
  "timestamp": "2026-03-07T12:00:00.000Z",
  "path": "/hello"
}
```

---

### `GET /tasks`

Returns a paginated list of tasks with their participant, user, and meeting data joined.

**Query Parameters** — see [Query Params Reference](QUERY_PARAMS.md) for full details.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `100` | Results per page (max 100) |
| `sort` | string | `createdAt:desc` | `columnName:asc\|desc` |
| `filter` | JSON string | none | URL-encoded column filter object |

**Filterable / Sortable Columns:** `createdAt`, `updatedAt`, `completedAt`, `complete`, `meetingId`, `participantId`

**Common Filter Examples**
```
# Incomplete tasks only
GET /tasks?filter={"complete":{"operator":"eq","value":false}}

# Tasks for a specific meeting
GET /tasks?filter={"meetingId":{"operator":"eq","value":"01KKC379CPB2NX9VQJ41WV18N9"}}

# Tasks for a specific participant
GET /tasks?filter={"participantId":{"operator":"eq","value":"<uuid>"}}
```

**Response `200`**
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

> `user` fields will be `null` when the participant has not yet been linked to a user account.

**Error Responses**

| Status | Description |
|--------|-------------|
| `500` | Database or unexpected server error |

---

### `GET /meetings`

Returns a paginated, sortable, and filterable list of meetings.

**Query Parameters** — see [Query Params Reference](QUERY_PARAMS.md) for full details.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `100` | Results per page (max 100) |
| `sort` | string | `createdAt:desc` | `columnName:asc\|desc` |
| `filter` | JSON string | none | URL-encoded column filter object |

**Filterable / Sortable Columns:** `createdAt`, `syncedAt`, `title`, `date`, `duration`, `hostEmail`, `organizerEmail`, `calendarType`, `participantsProcessed`, `dataProcessed`, `taskProcessed`, `usersProcessed`, `attemptsMade`

**Filter Example**
```
GET /meetings?filter={"participantsProcessed":{"operator":"eq","value":false}}
```

**Response `200`**
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
        "organizerEmail": "organizer@example.com",
        "duration": 37.26,
        "date": 1741564800000,
        "participantsProcessed": true,
        "dataProcessed": true,
        "taskProcessed": true,
        "usersProcessed": true,
        "syncedAt": "2026-03-14T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 51,
      "totalPages": 1,
      "hasNext": false,
      "hasPrevious": false
    }
  }
}
```

**Error Responses**

| Status | Description |
|--------|-------------|
| `500` | Database or unexpected server error |

---

### `GET /users`

Returns a paginated list of users.

**Query Parameters**

| Param | Type | Default | Min | Max | Description |
|-------|------|---------|-----|-----|-------------|
| `page` | integer | `1` | `1` | — | Page number |
| `limit` | integer | `10` | `1` | `100` | Results per page |

**Response `200`**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "id": "896b2358-299d-44c6-93b0-555fbd1d4114",
        "name": "Jane Doe",
        "email": "jane@example.com",
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

**Error Responses**

| Status | Description |
|--------|-------------|
| `500` | Internal server error |

---

### `POST /users`

Creates a new user.

**Request Body**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | Yes | Non-empty |
| `email` | string | Yes | Valid email format |

**Response `201`**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "896b2358-299d-44c6-93b0-555fbd1d4114",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-03-07T12:00:00.000Z",
      "updatedAt": "2026-03-07T12:00:00.000Z"
    }
  }
}
```

**Error Responses**

| Status | Description |
|--------|-------------|
| `400` | Validation error — missing or invalid fields |
| `409` | Email already registered |
| `500` | Internal server error |

**Validation Error Example (`400`)**
```json
{
  "success": false,
  "message": "Validation error",
  "data": {
    "errors": {
      "email": ["Invalid email address"]
    }
  }
}
```

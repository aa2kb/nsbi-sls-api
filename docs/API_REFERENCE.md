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

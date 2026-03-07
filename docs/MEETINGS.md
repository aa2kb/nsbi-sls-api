# Meetings Feature

Fetches meeting transcripts from the [Fireflies.ai](https://fireflies.ai) GraphQL API and exposes them via a Lambda handler that supports both on-demand HTTP requests and a daily scheduled sync.

## What It Does

- Calls the Fireflies GraphQL API (`https://api.fireflies.ai/graphql`) to retrieve meeting transcripts
- Returns transcript metadata including summaries, participants, attendance, and action items
- Runs automatically every day via EventBridge schedule
- Also available on-demand via `GET /meetings/fetch`

## How It Works

1. The Lambda handler (`src/lambda/meetings/fetch-meetings.ts`) detects the trigger type (HTTP vs. scheduled)
2. It delegates to the service layer (`src/services/meetings/meeting-service.ts`)
3. The service creates a `graphql-request` client with a `Bearer` token from `FIREFLIES_API_KEY`
4. The GraphQL query fetches transcripts from a given `fromDate` (defaults to `2026-02-27T00:00:00.000Z`)
5. On HTTP, the handler returns a JSON response; on schedule, it logs results and exits

## How to Use

### HTTP Endpoint

```
GET /meetings/fetch
x-api-key: <your-api-key>
```

**Optional query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fromDate` | ISO 8601 string | `2026-02-27T00:00:00.000Z` | Fetch transcripts from this date |
| `userId` | string | — | Filter by a specific Fireflies user ID |

**Example:**

```
GET /meetings/fetch?fromDate=2026-03-01T00:00:00.000Z
```

**Success Response (`200`):**

```json
{
  "success": true,
  "message": "Meetings fetched successfully",
  "data": {
    "meetings": [
      {
        "id": "transcript-id",
        "title": "Weekly Sync",
        "date": 1741392000000,
        "dateString": "2026-03-08",
        "host_email": "host@example.com",
        "organizer_email": "organizer@example.com",
        "participants": ["alice@example.com", "bob@example.com"],
        "summary": {
          "action_items": "...",
          "short_summary": "...",
          "keywords": ["sync", "planning"]
        },
        "meeting_attendees": [
          { "name": "Alice", "email": "alice@example.com", "displayName": "Alice Smith" }
        ],
        "meeting_attendance": [
          { "name": "Alice", "join_time": "...", "leave_time": "..." }
        ]
      }
    ],
    "count": 1
  }
}
```

**Error Response (`500`):**

```json
{
  "success": false,
  "message": "FIREFLIES_API_KEY environment variable is not set"
}
```

### Scheduled Trigger

The function runs automatically once per day via an EventBridge `rate(1 day)` rule. On scheduled invocations the function logs the number of meetings fetched but does not return an HTTP response.

## Key Implementation Details

| File | Purpose |
|------|---------|
| `src/lambda/meetings/fetch-meetings.ts` | Thin handler — detects trigger type, calls service, builds response |
| `src/services/meetings/meeting-service.ts` | Business logic — builds GraphQL client, executes query |
| `src/utils/response.ts` | Shared `buildResponse` helper |

**GraphQL client:** [`graphql-request`](https://github.com/jasonkuhrt/graphql-request) — lightweight, fetch-based GraphQL client.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLIES_API_KEY` | Yes | Fireflies.ai API bearer token |

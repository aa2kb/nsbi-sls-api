# Authentication

This project uses [Better Auth](https://better-auth.com) v1.5.5 for user authentication — email/password sign-up, session management, and password reset.

---

## Architecture

| Concern | Detail |
|---------|--------|
| Library | `better-auth` v1.5.5 |
| Transport | Cookie-based session tokens |
| Database | PostgreSQL — **`auth` schema** (completely separate from application schema) |
| Lambda handler | `src/lambda/auth/auth-handler.ts` |
| Auth config | `src/lib/auth.ts` |
| Routing | Single catch-all Lambda: `ANY /auth/{proxy+}` |

### Schema Isolation

Better Auth tables live in the `auth` PostgreSQL schema. The application tables (managed by Drizzle ORM) live in the `public` schema. The two schemas never share tables or foreign keys.

```
PostgreSQL database: nsbi
├── public schema  ← Drizzle ORM (users, meetings, tasks, …)
└── auth schema    ← Better Auth (user, session, account, verification)
```

Better Auth tables created by `pnpm run auth:migrate`:

| Table | Purpose |
|-------|---------|
| `auth.user` | Auth user accounts (email, name, hashed via reference) |
| `auth.session` | Active sessions (token, expiry, IP, user agent) |
| `auth.account` | Credential accounts (hashed passwords live here) |
| `auth.verification` | Email verification and password-reset tokens |

---

## Environment Variables

Add these to your `.env` (and to AWS Secrets Manager / SSM for production):

```env
# Minimum 32 characters, high entropy — rotate via BETTER_AUTH_SECRETS (plural)
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>

# Public-facing base URL of the API (used for redirect URLs in emails)
BETTER_AUTH_URL=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/dev

# Comma-separated list of trusted frontend origins (CORS)
BETTER_AUTH_TRUSTED_ORIGINS=https://your-frontend.com,http://localhost:3000
```

---

## Database Migration

Run once (or after any Better Auth config change):

```bash
pnpm run auth:migrate
```

This script (`scripts/better-auth-migrate.ts`):
1. Creates the `auth` PostgreSQL schema if it doesn't exist
2. Introspects the existing schema against the expected Better Auth schema
3. Runs only the necessary `CREATE TABLE` / `ALTER TABLE` statements

The migration is **non-destructive** — it only adds missing tables or columns.

---

## API Endpoints

All routes are under `/auth`. They are **public** (no API key required). Session state is managed via the `better-auth-session-token` cookie.

### Sign Up — `POST /auth/sign-up/email`

Create a new account.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "mypassword123"
}
```

**Response `201`:**
```json
{
  "user": {
    "id": "abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "createdAt": "2026-03-14T12:00:00.000Z",
    "updatedAt": "2026-03-14T12:00:00.000Z"
  },
  "session": { "token": "...", "expiresAt": "..." }
}
```

Sets a `Set-Cookie` header with the session token.

---

### Sign In — `POST /auth/sign-in/email`

Log in with email and password.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "mypassword123",
  "rememberMe": true
}
```

**Response `200`:**
```json
{
  "user": { "id": "...", "name": "...", "email": "..." },
  "session": { "token": "...", "expiresAt": "..." }
}
```

Sets a `Set-Cookie` header. Use the `token` value as a `Bearer` header or rely on cookie-based auth.

---

### Sign Out — `POST /auth/sign-out`

Invalidate the current session. Requires the session cookie or `Authorization: Bearer <token>` header.

**Response `200`:** Empty body, clears the session cookie.

---

### Get Session — `GET /auth/get-session`

Fetch the currently authenticated user and session. Requires the session cookie.

**Response `200`:**
```json
{
  "user": {
    "id": "abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "createdAt": "2026-03-14T12:00:00.000Z",
    "updatedAt": "2026-03-14T12:00:00.000Z"
  },
  "session": {
    "id": "...",
    "token": "...",
    "expiresAt": "2026-03-21T12:00:00.000Z",
    "userId": "abc123"
  }
}
```

Returns `null` when no valid session exists. **This is also the session refresh endpoint** — if the session's `updateAge` has elapsed, the `expiresAt` is extended automatically.

---

### List Sessions — `GET /auth/list-sessions`

Returns all active sessions for the authenticated user.

**Response `200`:**
```json
[
  {
    "id": "...",
    "token": "...",
    "userAgent": "Mozilla/5.0 ...",
    "ipAddress": "1.2.3.4",
    "expiresAt": "2026-03-21T12:00:00.000Z"
  }
]
```

---

### Revoke Session — `POST /auth/revoke-session`

Revoke a specific session by token.

**Request:**
```json
{ "token": "<session-token>" }
```

---

### Revoke Other Sessions — `POST /auth/revoke-other-sessions`

Revoke all sessions except the current one. Useful after a password change.

---

### Change Password — `POST /auth/change-password`

Change the current user's password. Requires an active session.

**Request:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456",
  "revokeOtherSessions": true
}
```

---

### Request Password Reset — `POST /auth/request-password-reset`

Sends a password-reset email if the address exists. Always returns `200` (no enumeration).

> ⚠️ Requires `sendResetPassword` to be configured in `src/lib/auth.ts` with an email provider.

**Request:**
```json
{
  "email": "john@example.com",
  "redirectTo": "https://your-app.com/reset-password"
}
```

---

### Reset Password — `POST /auth/reset-password`

Complete a password reset using the token from the email link.

**Request:**
```json
{
  "token": "<reset-token-from-email>",
  "newPassword": "newpassword456"
}
```

---

## Session Lifecycle

| Phase | Behaviour |
|-------|-----------|
| Created | On `sign-up` or `sign-in` — 7-day TTL |
| Refreshed | Automatically on `get-session` if the session is older than 1 day (`updateAge`) |
| Cached | Short-lived (5-minute) signed cookie cache avoids DB reads on every request |
| Revoked | On `sign-out`, `revoke-session`, or `revoke-other-sessions` |

---

## Sending Auth Headers

Better Auth uses cookies by default. For API clients (mobile, server-to-server):

```http
Authorization: Bearer <session-token>
```

or pass the `Cookie: better-auth.session_token=<token>` header.

---

## Key Files

| File | Role |
|------|------|
| `src/lib/auth.ts` | Better Auth instance — database pool, session config, plugin list |
| `src/lambda/auth/auth-handler.ts` | Lambda handler — bridges API Gateway events to `auth.handler` |
| `src/utils/lambda-auth-bridge.ts` | Converts `APIGatewayProxyEvent` ↔ Web Fetch API `Request`/`Response` |
| `scripts/better-auth-migrate.ts` | Non-destructive migration runner for the `auth` schema |

---

## Adding Auth Protection to Existing Routes

To protect an existing Lambda route with a Better Auth session instead of (or in addition to) an API key:

```typescript
import { auth } from '../../lib/auth.js';
import { eventToRequest } from '../../utils/lambda-auth-bridge.js';

export const handler = async (event: APIGatewayProxyEvent) => {
  const session = await auth.api.getSession({
    headers: new Headers(event.headers as Record<string, string>),
  });

  if (!session) {
    return buildResponse(401, false, 'Unauthorized');
  }

  // session.user and session.session are now available
};
```

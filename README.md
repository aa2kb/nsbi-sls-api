# NSBI Serverless API

A serverless REST API built with AWS Lambda, API Gateway, Node.js 22, TypeScript, and PostgreSQL (via Drizzle ORM). Deployed using the Serverless Framework with `esbuild` bundling.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 (ESM) |
| Language | TypeScript (strict) |
| Framework | Serverless Framework v4 |
| Database | PostgreSQL + Drizzle ORM |
| Bundler | esbuild |
| Package Manager | pnpm |
| Auth | API Key (API Gateway) |

## Project Structure

```
src/
  db/
    index.ts          # DB connection (singleton pg.Pool)
    schema.ts         # Drizzle table definitions
  lambda/
    hello/
      hello.ts        # Health-check endpoint
    users/
      list-users.ts   # GET /users
      create-user.ts  # POST /users
  utils/
    response.ts       # buildResponse helper (to be created)
scripts/
  drizzle-migrate.ts  # Run DB migrations
  validate-stage.js   # Guard for valid deploy stages
drizzle/              # Generated SQL migrations
docs/                 # Project documentation
```

## Getting Started

See [Development Guide](docs/DEVELOPMENT.md) for full local setup instructions.

```bash
pnpm install
cp .env.example .env   # fill in DB credentials
pnpm run offline       # start local dev server
```

## Deployment

Valid stages: `dev`, `prod`

```bash
pnpm run deploy:dev
pnpm run deploy:prod
```

## Documentation

| Document | Description |
|----------|-------------|
| [Development Guide](docs/DEVELOPMENT.md) | Local setup, environment variables, and scripts |
| [Lambda Functions](docs/LAMBDA_FUNCTIONS.md) | All Lambda handlers — purpose, config, and triggers |
| [API Reference](docs/API_REFERENCE.md) | All API endpoints, request/response schemas |
| [Database](docs/DATABASE.md) | Schema, migrations, and Drizzle ORM usage |
| [Meetings](docs/MEETINGS.md) | Fireflies.ai meeting transcript sync — HTTP and scheduled |

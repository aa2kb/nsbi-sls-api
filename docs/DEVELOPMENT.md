# Development Guide

## Prerequisites

- **Node.js** >= 22.13.0
- **pnpm** (install via `npm i -g pnpm`)
- **PostgreSQL** database (local or remote)
- **AWS credentials** configured for profile `nsbi`

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default: `5432`) |
| `DB_NAME` | Database name |
| `DB_USERNAME` | Database username |
| `DB_PASSWORD` | Database password |
| `STAGE` | Deployment stage (`dev` or `prod`) |

### 3. Run Database Migrations

```bash
pnpm run db:migrate
```

### 4. Start Local Dev Server

```bash
pnpm run offline
```

This starts `serverless-offline` on `http://localhost:3000`. The API key for local requests is configured in `serverless.yml`.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm run offline` | Start local serverless-offline server |
| `pnpm run build` | Type-check with TypeScript (no emit) |
| `pnpm run deploy:dev` | Deploy to `dev` stage |
| `pnpm run deploy:prod` | Deploy to `prod` stage |
| `pnpm run db:generate` | Generate a new migration from schema changes |
| `pnpm run db:migrate` | Apply pending migrations |
| `pnpm run db:push` | Push schema directly to DB (dev only) |
| `pnpm run db:studio` | Open Drizzle Studio visual browser |

---

## Project Conventions

### Lambda Handlers
- One handler per file in `src/lambda/<group>/<trigger>.ts`
- Handlers are thin — delegate business logic to `src/services/`
- Always use `buildResponse` from `src/utils/response.ts` for responses
- See [Lambda Functions](LAMBDA_FUNCTIONS.md) for the full list

### Adding a New Endpoint
1. Create handler in `src/lambda/<group>/<name>.ts`
2. Register in `serverless.yml` under `functions:`
3. Add business logic in `src/services/<group>/`
4. Document in `docs/LAMBDA_FUNCTIONS.md` and `docs/API_REFERENCE.md`

### Database Changes
1. Edit `src/db/schema.ts`
2. Run `pnpm run db:generate` to create a migration
3. Run `pnpm run db:migrate` to apply it
4. Update `docs/DATABASE.md`

### Code Style
- TypeScript strict mode — no `any`, no unused variables/parameters
- ESM modules (`"type": "module"` in package.json)
- Zod for all request body validation

---

## Deployment

Only `dev` and `prod` stages are valid. The `scripts/validate-stage.js` script enforces this before deploying.

```bash
# Deploy to dev
pnpm run deploy:dev

# Deploy to prod
pnpm run deploy:prod
```

Deployments use the `nsbi` AWS CLI profile. Make sure it's configured:

```bash
aws configure --profile nsbi
```

---

## Bundling

The project uses `esbuild` (via `serverless-esbuild`) to bundle Lambda functions. Key settings:

- **Format:** ESM (`esm`)
- **Target:** `node22`
- A `createRequire` banner is injected for CJS interop
- Each function is bundled independently (tree-shaking per Lambda)

TypeScript is **not** used to emit — esbuild handles transpilation. `tsc` is only used for type-checking (`pnpm run build`).

# AWS RDS Data API

Lambda functions connect to Aurora PostgreSQL via the [RDS Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html) instead of a direct TCP connection.

## Why Data API?

- **No VPC required** — Lambdas can run outside a VPC and still reach the database
- **No connection pooling** — HTTP-based, stateless; no cold-start connection delays
- **Simpler networking** — No NAT Gateway or VPC peering for DB access
- **IAM + Secrets Manager** — Credentials from Secrets Manager; no `DB_PASSWORD` in env

## How It Works

1. **Detection**: `src/db/index.ts` checks for `DB_RESOURCE_ARN` and `SECRET_ARN`. If both are set, it uses the Drizzle [AWS Data API driver](https://orm.drizzle.team/docs/connect-aws-data-api-pg).
2. **Lambda env**: `serverless.yml` passes `DB_RESOURCE_ARN` and `SECRET_ARN`.
3. **Migrations**: `drizzle.config.ts` and `scripts/drizzle-migrate.ts` always use node-postgres (direct connection). Run migrations from a machine that can reach the DB (e.g. local with VPN, or a bastion).

## Setup

1. **Enable Data API** on the Aurora cluster:
   ```bash
   aws rds enable-http-endpoint --resource-arn "arn:aws:rds:REGION:ACCOUNT:cluster:nsbi" --profile nsbi
   ```

2. **Create a Secrets Manager secret** (if not already present):
   ```bash
   aws secretsmanager create-secret \
     --name nsbi-db-credentials \
     --secret-string '{"username":"postgres","password":"YOUR_PASSWORD"}' \
     --profile nsbi
   ```

3. **Add to `.env`** (or CI secrets):
   ```
   DB_RESOURCE_ARN=arn:aws:rds:us-east-1:YOUR_ACCOUNT:cluster:nsbi
   SECRET_ARN=arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT:secret:nsbi-db-credentials-XXXXXX
   ```

4. **Deploy** — Lambda will use Data API automatically.

## Local Development

- **serverless offline**: If `DB_RESOURCE_ARN` and `SECRET_ARN` are in `.env`, offline will use Data API. To use direct connection instead, omit those vars and keep `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`.
- **Migrations / drizzle-kit**: Always use direct connection (`DB_HOST`, etc.). Data API is not used for migrations.

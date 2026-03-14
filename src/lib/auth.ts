import { betterAuth } from 'better-auth';
import { Pool } from 'pg';

let authPool: Pool | undefined;

const getAuthPool = (): Pool => {
  if (!authPool) {
    authPool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      // Scope all Better Auth tables to the "auth" schema — completely separate
      // from the application's "public" schema managed by Drizzle
      options: '-c search_path=auth',
      max: 1,
      idleTimeoutMillis: 30000,
    });
  }
  return authPool;
};

export const auth = betterAuth({
  // All Better Auth routes mount under /auth (e.g. POST /auth/sign-in/email)
  basePath: '/auth',

  database: getAuthPool(),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  session: {
    // Sessions expire after 7 days; refresh window is 1 day
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute client-side cookie cache
    },
  },

  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',')
    : [],
});

export type Auth = typeof auth;

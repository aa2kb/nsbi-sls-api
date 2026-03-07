import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Validation error',
          errors: parsed.error.flatten().fieldErrors,
        }),
      };
    }

    const [newUser] = await db.insert(users).values(parsed.data).returning();

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: newUser }),
    };
  } catch (error: unknown) {
    // Drizzle wraps pg errors — check both the error itself and its cause for code 23505
    const pgCode =
      (error instanceof Error && 'code' in error && (error as { code?: string }).code) ||
      (error instanceof Error && error.cause instanceof Error && 'code' in error.cause && (error.cause as { code?: string }).code);

    if (pgCode === '23505') {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'A user with this email already exists' }),
      };
    }

    console.error('Error creating user:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

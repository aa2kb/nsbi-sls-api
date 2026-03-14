import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { z } from 'zod';
import { verifyAuthToken } from '../../utils/auth.js';
import { buildResponse } from '../../utils/response.js';
const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await verifyAuthToken(event as APIGatewayProxyEvent);
    const body = JSON.parse(event.body ?? '{}');
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return buildResponse(400, false, 'Validation error', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const [newUser] = await db.insert(users).values(parsed.data).returning();

    return buildResponse(201, true, 'User created successfully', newUser);
  } catch (error: unknown) {
    // Drizzle wraps pg errors — check both the error itself and its cause for code 23505
    const pgCode =
      (error instanceof Error && 'code' in error && (error as { code?: string }).code) ||
      (error instanceof Error && error.cause instanceof Error && 'code' in error.cause && (error.cause as { code?: string }).code);

    if (pgCode === '23505') {
      return buildResponse(409, false, 'A user with this email already exists');
    }

    console.error('Error creating user:', error);
    return buildResponse(500, false, 'Internal server error');
  }
};

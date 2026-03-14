import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { verifyAuthToken } from '../../utils/auth.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await verifyAuthToken(event as APIGatewayProxyEvent);
    const allUsers = await db.select().from(users).orderBy(users.createdAt);

    return buildResponse(200, true, 'Users retrieved successfully', allUsers);
    } catch (error: unknown) {
    console.error('[ListUsers] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

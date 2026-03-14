import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { auth } from '../../lib/auth.js';
import {
  eventToRequest,
  responseToResult,
} from '../../utils/lambda-auth-bridge.js';

/**
 * Single catch-all Lambda handler for all Better Auth routes.
 *
 * Maps to: ANY /auth/{proxy+}
 *
 * Exposed endpoints (all under /auth):
 *   POST  /auth/sign-up/email          – Register a new account
 *   POST  /auth/sign-in/email          – Login (returns session token + cookie)
 *   POST  /auth/sign-out               – Logout (invalidates session)
 *   GET   /auth/get-session            – Fetch current session & user
 *   GET   /auth/list-sessions          – List all active sessions for user
 *   POST  /auth/revoke-session         – Revoke a specific session by token
 *   POST  /auth/revoke-other-sessions  – Revoke all sessions except current
 *   POST  /auth/change-password        – Change password (requires current pw)
 *   POST  /auth/request-password-reset – Send password-reset email
 *   POST  /auth/reset-password         – Confirm reset with token + new password
 *   OPTIONS /auth/{proxy+}             – CORS preflight
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type,Authorization,X-Api-Key,Cookie',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  const request = eventToRequest(event);
  const response = await auth.handler(request);
  return responseToResult(response);
};

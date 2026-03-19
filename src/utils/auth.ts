import { verifyToken } from "@clerk/backend";
import { APIGatewayProxyEvent } from 'aws-lambda';

function decodeJwtPayload(token: string): unknown {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT format');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
}

export const verifyAuthToken = async (event: APIGatewayProxyEvent): Promise<any> => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') ?? process.env.TEST_AUTHORIZATION_TOKEN;

  if (!token) throw new Error('Missing Authorization token');

  if (process.env.IS_OFFLINE) {
    return decodeJwtPayload(token);
  }

  try {
    const payload = await verifyToken(token, {
      jwtKey: process.env.CLERK_JWT_KEY,
      authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(','),
    });
    return payload;
  } catch (error) {
    console.error('Error verifying token:', error);
    throw new Error('Invalid Authorization token');
  }
};

import type { APIGatewayProxyResult } from 'aws-lambda';

export function buildResponse(
  statusCode: number,
  success: boolean,
  message: string,
  data?: unknown,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success, message, ...(data !== undefined ? { data } : {}) }),
  };
}

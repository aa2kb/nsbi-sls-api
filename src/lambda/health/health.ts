import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const stage = process.env.STAGE ?? 'dev';

  return buildResponse(200, true, 'OK', {
    status: 'ok',
    stage,
    timestamp: new Date().toISOString(),
    path: event.path,
  });
};

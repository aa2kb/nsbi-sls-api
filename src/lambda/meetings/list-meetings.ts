import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse } from '../../utils/response.js';
import { parseQueryParams } from '../../utils/query-params.js';
import { verifyAuthToken } from '../../utils/auth.js';
import { listMeetings } from '../../services/meetings/list-meetings-service.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await verifyAuthToken(event as APIGatewayProxyEvent);
    const params = parseQueryParams(event.queryStringParameters);
    const result = await listMeetings(params);

    return buildResponse(200, true, 'Meetings retrieved successfully', result);
  } catch (error) {
    console.error('[ListMeetings] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

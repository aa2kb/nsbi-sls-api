import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  processUsers,
  MeetingNotFoundError,
  MeetingNotReadyError,
} from '../../services/meetings/process-users-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const meetingId = event.pathParameters?.id;

  if (!meetingId) {
    return buildResponse(400, false, 'Meeting ID is required');
  }

  console.log(`[ProcessUsers] Processing users for meeting ${meetingId}`);

  try {
    const result = await processUsers(meetingId);

    if (result.alreadyProcessed) {
      return buildResponse(200, true, 'Users already processed', { alreadyProcessed: true });
    }

    return buildResponse(
      200,
      true,
      `Users processed — ${result.usersCreated} user(s) created, ${result.usersMatched} participant(s) linked`,
      result,
    );
  } catch (error) {
    if (error instanceof MeetingNotFoundError) {
      return buildResponse(404, false, error.message);
    }

    if (error instanceof MeetingNotReadyError) {
      return buildResponse(422, false, error.message);
    }

    console.error(`[ProcessUsers] Error processing users for meeting ${meetingId}:`, error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

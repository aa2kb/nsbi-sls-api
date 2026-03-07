import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { processParticipants, MeetingNotFoundError } from '../../services/meetings/participant-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const meetingId = event.pathParameters?.id;

  if (!meetingId) {
    return buildResponse(400, false, 'Meeting ID is required');
  }

  console.log(`[ProcessParticipants] Processing participants for meeting ${meetingId}`);

  try {
    const result = await processParticipants(meetingId);

    return buildResponse(
      200,
      true,
      `Participants processed — ${result.created} created, ${result.skipped} already existed`,
      result,
    );
  } catch (error) {
    if (error instanceof MeetingNotFoundError) {
      return buildResponse(404, false, error.message);
    }

    console.error(`[ProcessParticipants] Error processing participants for meeting ${meetingId}:`, error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

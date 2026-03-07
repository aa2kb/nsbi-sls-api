import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { processData, MeetingNotFoundError } from '../../services/meetings/process-data-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const meetingId = event.pathParameters?.id;

  if (!meetingId) {
    return buildResponse(400, false, 'Meeting ID is required');
  }

  console.log(`[ProcessData] Processing data for meeting ${meetingId}`);

  try {
    const result = await processData(meetingId);

    if (result.alreadyProcessed) {
      return buildResponse(200, true, 'Already processed', { alreadyProcessed: true });
    }

    const message = [
      `Data saved to s3://${process.env.MEETINGS_BUCKET}/${result.dataKey}`,
      result.audioKey && !result.audioSkipped
        ? `Audio saved to s3://${process.env.MEETINGS_BUCKET}/${result.audioKey}`
        : 'Audio skipped',
    ]
      .filter(Boolean)
      .join('. ');

    return buildResponse(200, true, message, result);
  } catch (error) {
    if (error instanceof MeetingNotFoundError) {
      return buildResponse(404, false, error.message);
    }

    console.error(`[ProcessData] Error processing data for meeting ${meetingId}:`, error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

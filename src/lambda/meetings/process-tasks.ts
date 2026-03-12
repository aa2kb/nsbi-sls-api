import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { processTasks, MeetingNotFoundError, MeetingNotReadyError } from '../../services/meetings/process-tasks-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const meetingId = event.pathParameters?.id;

  if (!meetingId) {
    return buildResponse(400, false, 'Meeting ID is required');
  }

  console.log(`[ProcessTasks] Processing tasks for meeting ${meetingId}`);

  try {
    const result = await processTasks(meetingId);

    if (result.alreadyProcessed) {
      return buildResponse(200, true, 'Tasks already processed', { alreadyProcessed: true });
    }

    return buildResponse(200, true, `Tasks processed — ${result.tasksCreated} task(s) created`, result);
  } catch (error) {
    if (error instanceof MeetingNotFoundError) {
      return buildResponse(404, false, error.message);
    }

    if (error instanceof MeetingNotReadyError) {
      return buildResponse(422, false, error.message);
    }

    console.error(`[ProcessTasks] Error processing tasks for meeting ${meetingId}:`, error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

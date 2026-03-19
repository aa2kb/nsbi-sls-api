import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { syncMeetings } from '../../services/meetings/meeting-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let body: unknown = null;
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      body = event.body;
    }
  }

  console.log('[MeetingWebhook] Incoming webhook payload:', JSON.stringify(body, null, 2));

  try {
    const result = await syncMeetings();
    return buildResponse(200, true, `Meetings synced — ${result.saved} saved, ${result.snsPublished} queued`, {
      saved: result.saved,
      fetched: result.fetched,
      snsPublished: result.snsPublished,
      fromDate: result.fromDate,
      latestMeetingDate: result.latestMeetingDate,
    });
  } catch (error) {
    console.error('[MeetingWebhook] Error during sync:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

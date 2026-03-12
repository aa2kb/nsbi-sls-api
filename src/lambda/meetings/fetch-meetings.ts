import type { APIGatewayProxyEvent, APIGatewayProxyResult, ScheduledEvent } from 'aws-lambda';
import { syncMeetings } from '../../services/meetings/meeting-service.js';
import { buildResponse } from '../../utils/response.js';

export const handler = async (
  event: APIGatewayProxyEvent | ScheduledEvent,
): Promise<APIGatewayProxyResult | void> => {
  const isHttp = 'httpMethod' in event;
  const trigger = isHttp ? 'http' : 'schedule';

  console.log(`[FetchMeetings] Handler invoked via ${trigger}`);

  try {
    const result = await syncMeetings();

    if (!isHttp) {
      console.log(`[FetchMeetings] Scheduled sync finished — saved ${result.saved} meeting(s)`);
      return;
    }

    return buildResponse(200, true, `Meetings synced successfully — ${result.saved} saved, ${result.snsPublished} queued`, {
      saved: result.saved,
      fetched: result.fetched,
      snsPublished: result.snsPublished,
      fromDate: result.fromDate,
      latestMeetingDate: result.latestMeetingDate,
    });
  } catch (error) {
    console.error(`[FetchMeetings] Error during ${trigger} sync:`, error);

    if (!isHttp) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

import type { APIGatewayProxyEvent, APIGatewayProxyResult, SNSEvent, SNSHandler } from 'aws-lambda';
import { processPipeline } from '../../services/meetings/process-pipeline-service.js';
import { buildResponse } from '../../utils/response.js';

// ─── SNS trigger ────────────────────────────────────────────────────────────
// Message format: plain meeting ID string  OR  JSON { "meetingId": "..." }

function parseSnsMessage(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as { meetingId?: string };
    return parsed.meetingId ?? null;
  } catch {
    // treat the raw string as a plain meeting ID
    return trimmed || null;
  }
}

export const snsHandler: SNSHandler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    const meetingId = parseSnsMessage(record.Sns.Message);

    if (!meetingId) {
      console.error(`[Pipeline] SNS record has no meetingId — message: ${record.Sns.Message}`);
      continue;
    }

    console.log(`[Pipeline] SNS triggered for meeting ${meetingId}`);

    try {
      const result = await processPipeline(meetingId);
      console.log(`[Pipeline] SNS pipeline completed for meeting ${meetingId}`, JSON.stringify(result));
    } catch (error) {
      console.error(`[Pipeline] SNS pipeline failed for meeting ${meetingId}:`, error);
      // Re-throw so Lambda marks the message as failed (enables DLQ / retry)
      throw error;
    }
  }
};

// ─── HTTP trigger (local testing) ───────────────────────────────────────────
// POST /meetings/{id}/process-pipeline

export const handler = async (
  event: APIGatewayProxyEvent | SNSEvent,
): Promise<APIGatewayProxyResult | void> => {
  // SNS events have a Records array with an Sns key
  if ('Records' in event && event.Records?.[0] && 'Sns' in event.Records[0]) {
    return snsHandler(event as SNSEvent, {} as never, () => {});
  }

  // HTTP path
  const httpEvent = event as APIGatewayProxyEvent;
  const meetingId = httpEvent.pathParameters?.id;

  if (!meetingId) {
    return buildResponse(400, false, 'Meeting ID is required');
  }

  console.log(`[Pipeline] HTTP triggered for meeting ${meetingId}`);

  try {
    const result = await processPipeline(meetingId);
    return buildResponse(200, true, `Pipeline completed for meeting ${meetingId}`, result);
  } catch (error) {
    console.error(`[Pipeline] HTTP pipeline failed for meeting ${meetingId}:`, error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildResponse(500, false, message);
  }
};

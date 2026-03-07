import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const stage = process.env.STAGE ?? 'dev';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Hello from NSBI API!',
      stage,
      timestamp: new Date().toISOString(),
      path: event.path,
    }),
  };
};

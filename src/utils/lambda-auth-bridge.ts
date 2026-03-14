import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';

/**
 * Converts an API Gateway Proxy event into a standard Web Fetch API Request
 * so it can be passed directly to Better Auth's handler.
 */
export function eventToRequest(event: APIGatewayProxyEvent): Request {
  const scheme = 'https';
  const host = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).host
    : 'localhost:3000';

  const url = new URL(`${scheme}://${host}${event.path}`);

  if (event.queryStringParameters) {
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const headers = new Headers();
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value !== undefined) headers.set(key, value);
    }
  }

  const isBodyMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    event.httpMethod.toUpperCase(),
  );

  const body =
    isBodyMethod && event.body
      ? event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body
      : undefined;

  return new Request(url.toString(), {
    method: event.httpMethod,
    headers,
    body,
  });
}

/**
 * Converts a standard Web Fetch API Response back into the shape that
 * API Gateway expects from a Lambda proxy integration.
 */
export async function responseToResult(
  response: Response,
): Promise<APIGatewayProxyResult> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  };

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    body,
  };
}

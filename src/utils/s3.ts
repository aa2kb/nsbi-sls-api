import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = 'us-east-1';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({ region: REGION });
  }
  return _client;
}

export function getMeetingsBucket(): string {
  const bucket = process.env.MEETINGS_BUCKET;
  if (!bucket) throw new Error('MEETINGS_BUCKET environment variable is not set');
  return bucket;
}

export async function uploadJson(bucket: string, key: string, data: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: 'application/json',
    }),
  );
}

export async function uploadStream(
  bucket: string,
  key: string,
  stream: ReadableStream,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: stream as never,
      ContentType: contentType,
    }),
  );
}

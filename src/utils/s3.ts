import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';

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

export async function getJson(bucket: string, key: string): Promise<string> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!response.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return response.Body.transformToString('utf-8');
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

/**
 * Upload a file from the local filesystem to S3, then delete the local file.
 * Always write to /tmp in Lambda before calling this.
 */
export async function uploadFileAndCleanup(
  bucket: string,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const { size } = await stat(filePath);

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

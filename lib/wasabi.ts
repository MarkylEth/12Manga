import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  WASABI_ACCESS_KEY_ID,
  WASABI_SECRET_ACCESS_KEY,
  WASABI_BUCKET,
  WASABI_REGION,
  WASABI_ENDPOINT,
  WASABI_PUBLIC_BASE_URL,
} = process.env;

if (!WASABI_ACCESS_KEY_ID || !WASABI_SECRET_ACCESS_KEY || !WASABI_BUCKET || !WASABI_REGION || !WASABI_ENDPOINT) {
  throw new Error('Wasabi ENV is not fully set');
}

export const wasabi = new S3Client({
  region: WASABI_REGION,
  endpoint: WASABI_ENDPOINT,            // wasabi s3 endpoint
  credentials: {
    accessKeyId: WASABI_ACCESS_KEY_ID,
    secretAccessKey: WASABI_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false, // для wasabi норм virtual-host style
});

export async function putPublicObject(key: string, body: Buffer, contentType = 'application/octet-stream', cacheControl?: string) {
  const cmd = new PutObjectCommand({
    Bucket: WASABI_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
    // ACL можно не указывать, если бакет policy уже public-read. Если нужно:
    // ACL: 'public-read',
  });
  await wasabi.send(cmd);
  return {
    key,
    url: publicUrl(key),
  };
}

export function publicUrl(key: string) {
  const base = WASABI_PUBLIC_BASE_URL || `${WASABI_ENDPOINT!.replace('https://', 'https://'+process.env.WASABI_BUCKET+'.')}`;
  return `${base}/${key}`.replace(/([^:]\/)\/+/g, '$1');
}

import 'server-only';
import { S3Client } from '@aws-sdk/client-s3';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export const wasabi = new S3Client({
  region: process.env.WASABI_REGION || 'eu-central-2',
  endpoint: process.env.WASABI_ENDPOINT || 'https://s3.eu-central-2.wasabisys.com',
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export const R2_BUCKET = process.env.R2_BUCKET!;
export const WASABI_BUCKET = process.env.WASABI_BUCKET!;
export const WASABI_PUBLIC_BASE = (process.env.WASABI_PUBLIC_BASE_URL || process.env.WASABI_PUBLIC_BASE || '').replace(/\/+$/, '');
export const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

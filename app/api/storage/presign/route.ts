// app/api/storage/presign/route.ts
import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.WASABI_REGION,                     // напр. 'eu-central-1'
  endpoint: `https://s3.${process.env.WASABI_REGION}.wasabisys.com`,
  credentials: { accessKeyId: process.env.WASABI_KEY!, secretAccessKey: process.env.WASABI_SECRET! },
  forcePathStyle: true,
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bucket = process.env.WASABI_BUCKET!;
    const op = (searchParams.get('op') || '').toLowerCase(); // 'put' | 'get'
    const key = searchParams.get('key') || '';
    if (!key || !op) return NextResponse.json({ ok:false, error:'missing params' }, { status:400 });

    if (op === 'put') {
      const ct = searchParams.get('ct') || 'application/octet-stream';
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: ct, ACL: 'private' });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 60 }); // 60 сек
      return NextResponse.json({ ok:true, url });
    }

    if (op === 'get') {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 60 }); // 60 сек
      return NextResponse.json({ ok:true, url });
    }

    return NextResponse.json({ ok:false, error:'bad op' }, { status:400 });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e?.message || 'presign error' }, { status:500 });
  }
}

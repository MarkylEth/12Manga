// app/api/dev/r2-tls/route.ts
import { NextResponse } from 'next/server';
import https from 'https';
import { constants as tlsConst } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) return NextResponse.json({ ok: false, err: 'R2_ENDPOINT is not set' }, { status: 400 });

  const hostname = new URL(endpoint).hostname;

  return new Promise<NextResponse>((resolve) => {
    const req = https.request(
      endpoint,
      {
        method: 'HEAD',
        agent: new https.Agent({
          keepAlive: true,
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.2',
          servername: hostname,
          ALPNProtocols: ['http/1.1'],
          ciphers: [
            'ECDHE-ECDSA-AES128-GCM-SHA256',
            'ECDHE-RSA-AES128-GCM-SHA256',
            'ECDHE-ECDSA-AES256-GCM-SHA384',
            'ECDHE-RSA-AES256-GCM-SHA384',
          ].join(':'),
          honorCipherOrder: true,
          secureProtocol: 'TLSv1_2_method',
          secureOptions: tlsConst.SSL_OP_NO_TICKET,
        }),
      },
      (res) => resolve(NextResponse.json({ ok: true, status: res.statusCode }))
    );
    req.on('error', (e) => resolve(NextResponse.json({ ok: false, err: String(e) }, { status: 500 })));
    req.end();
  });
}

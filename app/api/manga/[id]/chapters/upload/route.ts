// app/api/manga/[id]/chapters/upload/route.ts
import { NextResponse } from 'next/server';
import { requireUploader } from '@/lib/auth/route-guards';
import { cookies } from 'next/headers';

const allowed = ['http://localhost:3000','http://25.46.32.16:3008'];
function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const h = new Headers();
  if (allowed.includes(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
  }
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  return h;
}
export async function OPTIONS(req: Request) { return new NextResponse(null, { headers: cors(req) }); }

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireUploader(req);

  // --- ВРЕМЕННАЯ диагностика, не палит секреты ---
  const jar = await cookies();
  const dbg = {
    origin: req.headers.get('origin') ?? null,
    hasApiKey: !!req.headers.get('x-api-key'),
    hasSessionCookie: !!jar.get(process.env.SESSION_COOKIE_NAME ?? 'session')?.value,
    envHasAdminKey: !!process.env.ADMIN_UPLOAD_KEY,
    nodeEnv: process.env.NODE_ENV,
  };
  // ------------------------------------------------

  if (!gate.ok) {
    return NextResponse.json(
      { ok:false, message:'forbidden', reason: gate.reason, dbg },
      { status: 403, headers: cors(req) }
    );
  }

  // ... ваша логика аплоада
  return NextResponse.json({ ok:true }, { headers: cors(req) });
}

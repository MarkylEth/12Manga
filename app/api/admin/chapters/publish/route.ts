import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/route-guards';
import { publishChapterToWasabi } from '@/lib/storage/publish';

function allowByApiKey(req: Request) {
  const k = req.headers.get('x-api-key')?.trim();
  return !!k && k === process.env.ADMIN_UPLOAD_KEY;
}

export async function POST(req: Request) {
  if (!allowByApiKey(req)) {
    const auth = await requireRole(req, ['admin','moderator']);
    if (!auth.ok) return NextResponse.json({ ok:false, message:'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(()=> ({}));
  const chapterId = Number(body?.chapterId ?? body?.id ?? 0);
  const deleteStaging = body?.deleteStaging !== false;
  if (!chapterId) return NextResponse.json({ ok:false, message:'chapterId required' }, { status: 400 });

  try {
    const res = await publishChapterToWasabi(chapterId, { deleteStaging });
    return NextResponse.json({ ok:true, ...res });
  } catch (e:any) {
    return NextResponse.json({ ok:false, message:String(e?.message || e) }, { status: 500 });
  }
}

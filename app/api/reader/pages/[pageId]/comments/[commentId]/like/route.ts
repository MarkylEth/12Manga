import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { commentId: string } }) {
  try {
    const id = String(params.commentId);
    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    await query(
      `insert into page_comment_likes (comment_id, user_id)
       values ($1, $2) on conflict do nothing`,
      [id, user_id]
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { commentId: string } }) {
  try {
    const id = String(params.commentId);
    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    await query(`delete from page_comment_likes where comment_id = $1 and user_id = $2`, [id, user_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

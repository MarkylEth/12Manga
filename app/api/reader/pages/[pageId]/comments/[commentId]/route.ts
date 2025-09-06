import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { commentId: string } }) {
  try {
    const id = String(params.commentId);
    const { user_id, content } = await req.json().catch(() => ({}));
    if (!user_id) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!content) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

    const r = await query(
      `update page_comments
       set content = $1, is_edited = true, edited_at = now()
       where id = $2 and user_id = $3
       returning id`,
      [content, id, user_id]
    );
    if (r.rowCount === 0) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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

    const r = await query(
      `delete from page_comments where (id = $1 or parent_id = $1) and user_id = $2`,
      [id, user_id]
    );
    if (r.rowCount === 0) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// app/api/moderation/rules/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  pattern: string;
  kind: "word" | "phrase" | "regex";
  category: "abuse" | "harassment" | "illegal_trade" | string;
  lang: string | null;
  severity: number | null;
  is_active?: boolean | null;
};

async function getSql() {
  const url = process.env.DATABASE_URL;
  // @neondatabase/serverless
  const neonMod = await import("@neondatabase/serverless").catch(() => null as any);
  if (!url || !neonMod?.neon) return null;
  return neonMod.neon(url);
}

export async function GET() {
  try {
    const sql = await getSql();
    if (!sql) {
      return NextResponse.json({ ok: true, items: [], hint: "DB not configured" });
    }

    // Берём только активные правила
    const rows = await sql/* sql */`
      SELECT
        id::text,
        pattern::text,
        kind::text   AS kind,
        category::text AS category,
        lang::text,
        COALESCE(severity, 0)::int AS severity,
        COALESCE(is_active, true)  AS is_active
      FROM public.mod_banned_patterns
      WHERE COALESCE(is_active, true) = true
      ORDER BY severity DESC, created_at NULLS LAST, id
    `;

    // Приведём типы аккуратно
    const items: Row[] = (rows || []).map((r: any) => ({
      id: String(r.id),
      pattern: String(r.pattern ?? ""),
      kind: (String(r.kind || "phrase").toLowerCase() as any),
      category: String(r.category || "abuse"),
      lang: r.lang == null ? null : String(r.lang),
      severity: r.severity == null ? null : Number(r.severity),
      is_active: Boolean(r.is_active),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}

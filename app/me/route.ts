// app/me/route.ts
import { NextResponse } from "next/server";

/**
 * Auth временно выключен, возвращаем пустой профиль.
 * Когда внедрите свою авторизацию — можно начать
 * прокидывать user из cookies/session.
 */
export async function GET() {
  return NextResponse.json({ ok: true, user: null, profile: null });
}

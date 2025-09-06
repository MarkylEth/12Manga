import { NextResponse } from "next/server";
import { getUserBySession } from "@/lib/auth/service";
import { readSessionCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";

export async function GET() {
  const token = await readSessionCookie();      // <-- await
  if (!token) return NextResponse.json({ user: null });

  const user = await getUserBySession(token);
  return NextResponse.json({ user });
}

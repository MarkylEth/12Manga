// lib/url.ts
export function getOrigin(req: Request) {
  const u = new URL(req.url);
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${u.protocol}//${u.host}`;
}

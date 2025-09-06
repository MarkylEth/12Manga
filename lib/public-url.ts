export const ASSET_BASE_URL = (process.env.ASSET_BASE_URL || '').replace(/\/+$/,'');
export function publicUrl(p: string | null | undefined): string {
  const s = (p ?? '').toString();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  return ASSET_BASE_URL ? `${ASSET_BASE_URL}/${s}` : `/${s}`;
}

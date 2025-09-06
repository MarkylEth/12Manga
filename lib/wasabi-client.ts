export async function presignGet(key: string): Promise<string> {
  const r = await fetch(`/api/storage/presign?op=get&key=${encodeURIComponent(key)}`);
  const j = await r.json();
  if (!r.ok || !j?.url) throw new Error(j?.error || 'presign get failed');
  return j.url as string;
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  const r = await fetch(`/api/storage/presign?op=put&key=${encodeURIComponent(key)}&ct=${encodeURIComponent(contentType)}`);
  const j = await r.json();
  if (!r.ok || !j?.url) throw new Error(j?.error || 'presign put failed');
  return j.url as string;
}

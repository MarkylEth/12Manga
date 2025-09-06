// src/lib/storage/r2-upload-client.ts
export async function uploadFileToR2(file: File, key: string, cacheControl?: string) {
  // 1) просим у сервера presigned URL
  const presignRes = await fetch('/api/r2/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key,
      contentType: file.type || 'application/octet-stream',
      cacheControl: cacheControl || 'public, max-age=604800',
      expiresIn: 60,
    }),
  });
  const data = await presignRes.json();

  if (!presignRes.ok || !data?.ok) {
    throw new Error(data?.message || 'Не удалось получить presigned URL');
  }

  // 2) делаем прямой PUT в R2 из браузера
  const put = await fetch(data.url as string, {
    method: 'PUT',
    headers: data.headers || { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!put.ok) {
    const txt = await put.text().catch(() => '');
    throw new Error(`R2 PUT ${put.status}: ${txt}`);
  }

  // 3) возвращаем публичный URL
  return { key: data.key as string, url: data.publicUrl as string };
}

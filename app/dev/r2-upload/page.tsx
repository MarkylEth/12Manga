'use client';
import { useState } from 'react';
import { uploadFileToR2 } from '@/lib/storage/r2-upload-client';

export default function R2UploadDemo() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <main style={{ padding: 24 }}>
      <h1>R2 Direct Upload (presigned)</h1>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        disabled={!file || loading}
        onClick={async () => {
          if (!file) return;
          setLoading(true);
          setErr(null);
          setUrl(null);
          try {
            const key = `staging/uploads/${Date.now()}-${file.name}`;
            const { url } = await uploadFileToR2(file, key);
            setUrl(url);
          } catch (e: any) {
            setErr(String(e?.message || e));
          } finally {
            setLoading(false);
          }
        }}
        style={{ marginLeft: 12 }}
      >
        {loading ? 'Загрузка…' : 'Загрузить'}
      </button>

      {url && (
        <p>
          Готово: <a href={url} target="_blank" rel="noreferrer">{url}</a>
        </p>
      )}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </main>
  );
}

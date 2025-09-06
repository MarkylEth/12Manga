'use client';

import React, { useState, useRef } from 'react';

type Props = {
  onUploaded: (url: string) => void;
  buttonText?: string;
};

export default function CoverUploader({ onUploaded, buttonText = 'Загрузить обложку' }: Props) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePick() {
    fileRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'upload_failed');
      setPreview(json.url);
      onUploaded(json.url);
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-28 aspect-[3/4] bg-black/5 rounded overflow-hidden flex items-center justify-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="cover" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-black/50">no cover</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handlePick}
          disabled={loading}
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? 'Загрузка...' : buttonText}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFileChange}
        />
      </div>
    </div>
  );
}

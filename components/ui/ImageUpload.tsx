'use client';

import React, { useState, useRef } from 'react';
import { Loader2, Image as ImageIcon, Link2 } from 'lucide-react';

interface ImageUploadProps {
  onImageAdded: (url: string) => void;
  maxImages?: number;
  currentImages?: string[];
  theme?: 'light' | 'dark';
}

export default function ImageUpload({
  onImageAdded,
  maxImages = 10,
  currentImages = [],
  theme = 'light',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = currentImages.length < maxImages;

  async function uploadFile(file: File) {
    if (!canAddMore) {
      alert(`Максимум ${maxImages} изображений`);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'image');

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Bad JSON: ${text.slice(0, 200)}`);
      }
      if (!res.ok || !data?.ok || !data?.url) throw new Error(data?.error || `HTTP ${res.status}`);

      onImageAdded(data.url);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Ошибка загрузки изображения');
    } finally {
      setUploading(false);
    }
  }

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const limit = Math.min(files.length, maxImages - currentImages.length);
    for (let i = 0; i < limit; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        void uploadFile(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const addImageByUrl = () => {
    const url = urlInput.trim();
    if (!url) return;

    if (!canAddMore) {
      alert(`Максимум ${maxImages} изображений`);
      return;
    }

    onImageAdded(url);
    setUrlInput('');
  };

  const cardBg =
    theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-700 border-slate-600';

  return (
    <div className="space-y-3">
      <div
        className={`relative rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50/50'
            : canAddMore
            ? 'border-slate-300 hover:border-slate-400'
            : 'border-slate-200 opacity-50'
        } ${cardBg}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (canAddMore) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={!canAddMore || uploading}
        />

        <div className="text-center">
          <div className="mb-3">
            {uploading ? (
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
            ) : (
              <ImageIcon
                className={`mx-auto h-8 w-8 ${
                  canAddMore ? 'text-slate-400' : 'text-slate-300'
                }`}
              />
            )}
          </div>

          {uploading ? (
            <div className="text-sm opacity-70">Загрузка…</div>
          ) : (
            <>
              <div className="text-sm">Перетащите изображения сюда или кликните для выбора</div>
              <div className="text-xs opacity-60">Поддерживаются JPG/PNG/WebP/GIF</div>
            </>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-3 ${cardBg}`}>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 opacity-70" />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Вставьте URL изображения"
            className="flex-1 rounded-md border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800"
            disabled={uploading || !canAddMore}
          />
          <button
            type="button"
            onClick={addImageByUrl}
            disabled={uploading || !canAddMore || !urlInput.trim()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

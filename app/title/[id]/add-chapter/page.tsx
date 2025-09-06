// app/title/[id]/add-chapter/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useTheme } from "@/lib/theme/context";

export default function AddChapterPage() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const mangaId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params!.id[0] : params?.id;
    const m = raw?.match(/^\d+/)?.[0];
    return m ? Number(m) : NaN;
  }, [params?.id]);

  const [number, setNumber] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [zip, setZip] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (!Number.isFinite(mangaId)) throw new Error("Некорректный id тайтла");
      if (!number.trim()) throw new Error("Укажите номер главы");
      if (!zip) throw new Error("Загрузите zip с изображениями");

      // 1) загрузка архива
      const fd = new FormData();
      fd.append("file", zip);
      fd.append("type", "chapter");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const uj = await up.json().catch(() => ({}));
      if (!up.ok || !uj?.ok || !uj?.url) throw new Error(uj?.error || "Не удалось загрузить архив");

      // 2) создание записи главы
      const body = {
        mangaId,
        number: number.trim(),
        title: title.trim() || null,
        archiveUrl: uj.url,
      };
      const res = await fetch("/api/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const jj = await res.json().catch(() => ({}));
      if (!res.ok || !jj?.ok) throw new Error(jj?.error || `HTTP ${res.status}`);

      setOk("Глава добавлена");
      router.push(`/manga/${mangaId}`);
    } catch (e: any) {
      setError(e?.message || "Ошибка добавления главы");
    } finally {
      setSaving(false);
    }
  }

  const pageBg =
    theme === "light"
      ? "bg-gray-50 text-gray-900"
      : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100";
  const card = theme === "light" ? "bg-white border-gray-200" : "bg-slate-800/60 border-slate-700";
  const input =
    theme === "light"
      ? "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
      : "w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/20";

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <Header showSearch={false} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="text-2xl font-bold mb-4">Добавить главу</div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {ok && (
            <div className="mb-4 rounded-lg border border-green-400/40 bg-green-500/10 px-3 py-2 text-sm text-green-200">
              {ok}
            </div>
          )}

          <div className="mb-4">
            <div className="text-sm mb-1">Номер главы *</div>
            <input className={input} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="например, 12" />
          </div>

          <div className="mb-4">
            <div className="text-sm mb-1">Название (необязательно)</div>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название главы" />
          </div>

          <div className="mb-6">
            <div className="text-sm mb-1">ZIP c изображениями *</div>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setZip(e.target.files?.[0] || null)}
              className={input}
            />
          </div>

          <button
            disabled={saving}
            onClick={submit}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium ${
              saving ? "opacity-60 cursor-not-allowed" : ""
            } ${theme === "light" ? "bg-slate-900 text-white" : "bg-white text-black"}`}
          >
            {saving ? "Загрузка…" : "Сохранить главу"}
          </button>
        </div>
      </div>
    </div>
  );
}

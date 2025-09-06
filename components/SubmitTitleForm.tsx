// пример: components/SubmitTitleForm.tsx
"use client";

import React, { useState } from "react";

export default function SubmitTitleForm() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"ongoing" | "completed" | "paused" | "">("");
  const [releaseYear, setReleaseYear] = useState<string>("");
  const [ageRating, setAgeRating] = useState<string>("");
  const [kind, setKind] = useState<string>("манга");
  const [genres, setGenres] = useState<string>(""); // через запятую
  const [links, setLinks] = useState<string>("");   // любым списком

  const [note, setNote] = useState<string>("");     // комментарий модератору
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const payload = {
        title_ru: title,
        author,
        artist,
        description,
        status: status || null,
        release_year: releaseYear || null,
        age_rating: ageRating || null,
        type: kind || null,
        genres: genres
          ? genres.split(",").map(s => s.trim()).filter(Boolean)
          : [],
      };

      const res = await fetch("/api/title-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "new_title",
          payload,
          author_comment: note || null,
          source_links: links, // можно строкой — бэкенд сам распарсит
        }),
      });

      // ВСЕГДА JSON — никаких “Bad JSON … <!DOCTYPE html>…”
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      setMsg(`Заявка отправлена. id=${json.id ?? "?"}`);
    } catch (err: any) {
      setMsg(`Ошибка: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Название (рус.)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
      />
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Автор"
        value={author}
        onChange={e => setAuthor(e.target.value)}
      />
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Художник"
        value={artist}
        onChange={e => setArtist(e.target.value)}
      />
      <textarea
        className="border px-3 py-2 rounded w-full"
        placeholder="Описание"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Статус (ongoing/completed/paused)"
        value={status}
        onChange={e => setStatus(e.target.value as any)}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          className="border px-3 py-2 rounded w-full"
          placeholder="Год релиза"
          value={releaseYear}
          onChange={e => setReleaseYear(e.target.value)}
        />
        <input
          className="border px-3 py-2 rounded w-full"
          placeholder="Возрастной рейтинг"
          value={ageRating}
          onChange={e => setAgeRating(e.target.value)}
        />
      </div>
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Тип (манга/ранобэ/...)"
        value={kind}
        onChange={e => setKind(e.target.value)}
      />
      <input
        className="border px-3 py-2 rounded w-full"
        placeholder="Жанры (через запятую)"
        value={genres}
        onChange={e => setGenres(e.target.value)}
      />
      <textarea
        className="border px-3 py-2 rounded w-full"
        placeholder="Ссылки на оригинал (в любом виде: строки, с новой строки, через запятую)"
        value={links}
        onChange={e => setLinks(e.target.value)}
      />
      <textarea
        className="border px-3 py-2 rounded w-full"
        placeholder="Комментарий модератору"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
      >
        {loading ? "Отправляем…" : "Отправить"}
      </button>

      {msg && <div className="text-sm opacity-80">{msg}</div>}
    </form>
  );
}

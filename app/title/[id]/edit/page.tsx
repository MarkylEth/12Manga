// app/title/[id]/edit/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useTheme } from "@/lib/theme/context";
import { ArrowLeft, Upload, X, User, AlertTriangle, CheckCircle } from "lucide-react";

/* ====== константы ====== */
const RU_STATUS = ["онгоинг", "завершен", "приостановлен"] as const;
const TR_STATUS = ["продолжается", "завершен", "заброшен", "заморожен"] as const;
const AGE = ["0+", "12+", "16+", "18+"] as const;
const TYPES = ["манга", "манхва", "маньхуа", "другое"] as const;

const DEFAULT_GENRES = [
  "Арт","Безумие","Боевик","Боевые искусства","Вампиры","Военное","Гарем","Гендерная интрига",
  "Героическое фэнтези","Демоны","Детектив","Дзёсэй","Драма","Игра","Исекай","История","Киберпанк",
  "Кодомо","Комедия","Космос","Магия","Махо-сёдзё","Машины","Меха","Мистика","Музыка",
  "Научная фантастика","Омегаверс","Пародия","Повседневность","Полиция","Постапокалиптика",
  "Приключения","Психология","Романтика","Самурайский боевик","Сверхъестественное",
  "Сёдзё","Сёнен","Спорт","Супер сила","Сэйнэн","Трагедия","Триллер","Ужасы",
  "Фантастика","Фэнтези","Школа","Эротика","Этти",
];

const DEFAULT_TAGS = [
  "Азартные игры","Алхимия","Амнезия / Потеря памяти","Ангелы","Антигерой","Антиутопия","Апокалипсис",
  "Армия","Артефакты","Боги","Бои на мечах","Борьба за власть","Брат и сестра","Будущее","Ведьма",
  "Вестерн","Видеоигры","Виртуальная реальность","Владыка демонов","Военные","Война",
  "Волшебники / маги","Волшебные существа","Воспоминания из другого мира","Выживание",
  "ГГ женщина","ГГ имба","ГГ мужчина","Геймеры","Гильдии","ГГ глупый","Гоблины","Горничные",
  "Гуро","Гяру","Демоны","Драконы","Дружба","Жестокий мир","Животные компаньоны",
  "Завоевание мира","Зверолюди","Злые духи","Зомби","Игровые элементы","Империи","Исторические",
  "Камера","Квесты","Космос","Кулинария","Культивирование","ЛГБТ","Легендарное оружие","Лоли",
  "Магическая академия","Магия","Мафия","Медицина","Месть","Монстро-девушки","Монстры","Мурим",
  "На проверке","Навыки / способности","Наёмники","Насилие / жестокость","Нежить","Ниндзя",
  "Обмен телами","Обратный Гарем","Огнестрельное оружие","Офисные Работники","Пародия","Пираты",
  "Подземелья","Политика","Полиция","Полностью CGI","Преступники / Криминал","Призраки / Духи",
  "Путешествие во времени","Рабы","Разумные расы","Ранги силы","Регрессия","Реинкарнация","Роботы",
  "Рыцари","Самураи","Сгенерировано ИИ","Система","Скрытые личности","Содержит нецензурную брань",
  "Спасение мира","Спортивное тело","Средневековье","Стимпанк","Супергерои","Традиционные игры",
  "ГГ умный","Учитель","Фермерство","Философия","Хикикомори","Холодное оружие","Шантаж","Эльфы",
  "Якудза","Яндере","Япония",
];

/* ====== утилиты ====== */
const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const toStrArray = (v: any): string[] => {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (!v) return [];
  try {
    const p = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    if (typeof v === "string") {
      return v.split(/[,\n;]+/g).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }
};
const isValidImg = (s: string) => /^https?:\/\/|^\//i.test(s || "");

/** безопасный json */
async function safeJson<T = any>(res: Response): Promise<T | null> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!text) return null;
  if (ct.includes("application/json")) {
    try { return JSON.parse(text) as T; } catch { return null; }
  }
  try { return JSON.parse(text) as T; } catch { return null; }
}

/* ===================================================== */

export default function TitleEditPage() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const rawId = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const mangaId = Number(rawId?.match(/^\d+/)?.[0] ?? NaN);

  const pageBg =
    theme === "light"
      ? "bg-gray-50 text-gray-900"
      : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100";
  const card =
    theme === "light" ? "bg-white border-gray-200" : "bg-gray-900/40 border-white/10";
  const label = theme === "light" ? "text-gray-700" : "text-gray-100";
  const muted = theme === "light" ? "text-gray-500" : "text-gray-400";
  const inputCls =
    theme === "light"
      ? "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
      : "w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/20";
  const primaryBtn =
    theme === "light"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : "bg-white text-black hover:opacity-90";
  const secondaryBtn =
    theme === "light"
      ? "border-gray-300 bg-white hover:bg-gray-100 text-gray-900"
      : "border-white/10 bg-gray-800/60 hover:bg-gray-700 text-white";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // форма
  const [coverUrl, setCoverUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [titleRu, setTitleRu] = useState("");
  const [titleRomaji, setTitleRomaji] = useState("");
  const [author, setAuthor] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<(typeof RU_STATUS)[number] | "">("");
  const [trStatus, setTrStatus] = useState<(typeof TR_STATUS)[number] | "">("");
  const [age, setAge] = useState<(typeof AGE)[number] | "">("");
  const [year, setYear] = useState<number | "">("");
  const [kind, setKind] = useState<(typeof TYPES)[number] | "">("");

  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const [origLinks, setOrigLinks] = useState<string[]>([]);
  const [modMessage, setModMessage] = useState("");

  const [translators, setTranslators] = useState<
    { id: number | string; name: string; slug: string | null }[]
  >([]);
  const [translatorQuery, setTranslatorQuery] = useState("");
  const [translatorResults, setTranslatorResults] = useState<any[]>([]);

  /* ===== Загрузка текущих данных тайтла (через API) ===== */
  useEffect(() => {
    if (!Number.isFinite(mangaId)) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) базовая карточка
        const baseRes = await fetch(`/api/manga/${mangaId}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const baseJ = (await safeJson<any>(baseRes)) ?? {};
        if (!baseRes.ok || !baseJ?.item) throw new Error("Тайтл не найден");

        const m = baseJ.item;

        // 2) параллельно жанры/теги/команды
        const [gJ, tJ, tmJ] = await Promise.all([
          fetch(`/api/manga/${mangaId}/genres`, { cache: "no-store" }).then(safeJson<any>).catch(() => null),
          fetch(`/api/manga/${mangaId}/tags`,   { cache: "no-store" }).then(safeJson<any>).catch(() => null),
          fetch(`/api/manga/${mangaId}/teams`,  { cache: "no-store" }).then(safeJson<any>).catch(() => null),
        ]);

        if (cancelled) return;

        // Основные поля
        setCoverUrl(m.cover_url || "");
        setTitleRu(m.title || "");
        setTitleRomaji(m.title_romaji || "");
        setAuthor(m.author || "");
        setArtist(m.artist || "");
        setDescription(m.description || "");
        setStatus((m.status as any) || "");
        setTrStatus((m.translation_status as any) || "");
        setAge((m.age_rating as any) || "");
        setYear(m.release_year ?? "");
        setKind((m.type as any) || "");

        // Жанры/теги
        const genresFromApi: string[] = Array.isArray(gJ?.items) ? gJ.items.map((x: any) => x.genre) : [];
        const tagsFromApi: string[] = Array.isArray(tJ?.items) ? tJ.items : [];
        setGenres(genresFromApi.length ? genresFromApi : toStrArray(m.genres));
        setTags(tagsFromApi.length ? tagsFromApi : toStrArray(m.tags));

        // Переводчики
        const teams = Array.isArray(tmJ?.items) ? tmJ.items : [];
        setTranslators(teams.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug ?? null })));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Не удалось загрузить данные тайтла");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [mangaId]);

  /* ===== live-поиск команд (через /api/teams/search) ===== */
  useEffect(() => {
    let active = true;
    (async () => {
      const q = translatorQuery.trim();
      if (!q) {
        setTranslatorResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`);
        const j = await safeJson<any>(res);
        if (active) setTranslatorResults(Array.isArray(j?.data) ? j!.data : []);
      } catch {
        if (active) setTranslatorResults([]);
      }
    })();
    return () => { active = false; };
  }, [translatorQuery]);

  function addTranslator(t: any) {
    if (!t) return;
    setTranslators((prev) =>
      prev.some((x) => String(x.id) === String(t.id))
        ? prev
        : [...prev, { id: t.id, name: t.name, slug: t.slug ?? null }]
    );
    setTranslatorQuery("");
    setTranslatorResults([]);
  }
  const removeTranslator = (id: number | string) =>
    setTranslators((prev) => prev.filter((x) => String(x.id) !== String(id)));

  async function uploadCoverIfNeeded(): Promise<string> {
    if (!coverFile) return coverUrl;
    const fd = new FormData();
    fd.append("file", coverFile);
    fd.append("type", "cover");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await safeJson<{ ok?: boolean; url?: string; error?: string }>(r);
    if (!r.ok || !j?.ok || !j?.url) throw new Error(j?.error || "Ошибка загрузки обложки");
    return j.url as string;
  }

  /* ===== отправка правки (в title_submissions) ===== */
  async function submitForModeration() {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (!Number.isFinite(mangaId)) throw new Error("Некорректный id тайтла");
      const finalCover = await uploadCoverIfNeeded();

      const payload = {
        title_ru: titleRu || null,
        title_romaji: titleRomaji || null,
        author: author || null,
        artist: artist || null,
        description: description || null,
        status: status || null,
        translation_status: trStatus || null,
        age_rating: age || null,
        release_year: year === "" ? null : year,
        type: kind || null,
        cover_url: finalCover || null,
        genres,
        tags,
        translators,
      };

      const body = {
        type: "title_edit",
        mangaId,
        author_comm: modMessage || null,
        title_romaji: titleRomaji || null,
        genres,
        tags,
        source_links: origLinks,
        payload,
      };

      const res = await fetch("/api/title-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await safeJson<any>(res);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Ошибка отправки: HTTP ${res.status}`);
      }

      setNotice("Правка отправлена на модерацию");
      router.push(`/title/${mangaId}`);
    } catch (e: any) {
      setError(e?.message || "Не удалось отправить на модерацию");
    } finally {
      setSaving(false);
    }
  }

  if (!Number.isFinite(mangaId)) {
    return (
      <div className={`min-h-screen ${pageBg}`}>
        <Header showSearch={false} />
        <div className="p-6 text-sm opacity-70">Некорректный адрес: отсутствует id тайтла.</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <Header showSearch={false} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href={`/title/${mangaId}`}
            className={cn("inline-flex items-center gap-2 rounded-xl px-3 py-2 border", secondaryBtn)}
          >
            <ArrowLeft className="h-4 w-4" /> Назад к тайтлу
          </Link>
          <div className="text-2xl font-bold">Предложить правку</div>
        </div>

        {error && (
          <div
            className={cn(
              "mb-4 rounded-xl border p-3",
              theme === "light"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-red-500/10 border-red-500/30 text-red-100"
            )}
          >
            <AlertTriangle className="mr-2 inline-block h-4 w-4" />
            {error}
          </div>
        )}
        {notice && (
          <div
            className={cn(
              "mb-4 rounded-xl border p-3",
              theme === "light"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-green-500/10 border-green-500/30 text-green-100"
            )}
          >
            <CheckCircle className="mr-2 inline-block h-4 w-4" />
            {notice}
          </div>
        )}

        {loading ? (
          <div className="opacity-70 text-sm">Загрузка…</div>
        ) : (
          <div className={cn("space-y-6 rounded-2xl border p-5", card)}>
            {/* COVER + названия */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
              <div>
                <div className="relative h-[300px] w-full overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  {coverFile ? (
                    <Image src={URL.createObjectURL(coverFile)} alt="preview" fill className="object-cover" />
                  ) : isValidImg(coverUrl) ? (
                    <Image src={coverUrl} alt="cover" fill className="object-cover" />
                  ) : (
                    <div className={cn("grid h-full w-full place-items-center text-sm", muted)}>Нет обложки</div>
                  )}
                </div>
                <label className={cn("mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", secondaryBtn)}>
                  <Upload className="h-4 w-4" />
                  <span>Загрузить файл</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                </label>
                <div className="mt-2">
                  <input
                    placeholder="Или URL обложки…"
                    className={inputCls}
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className={cn("mb-1 text-sm", label)}>Название (русское)</div>
                  <input className={inputCls} value={titleRu} onChange={(e) => setTitleRu(e.target.value)} placeholder="«Ван-панчмэн»" />
                </div>
                <div>
                  <div className={cn("mb-1 text-sm", label)}>Оригинальное (ромадзи)</div>
                  <input className={inputCls} value={titleRomaji} onChange={(e) => setTitleRomaji(e.target.value)} placeholder="One Punch Man / Wanpanman" />
                </div>
                <div>
                  <div className={cn("mb-1 text-sm", label)}>Автор</div>
                  <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
                </div>
                <div>
                  <div className={cn("mb-1 text-sm", label)}>Художник</div>
                  <input className={inputCls} value={artist} onChange={(e) => setArtist(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Описание */}
            <div>
              <div className={cn("mb-1 text-sm", label)}>Описание</div>
              <textarea className={cn(inputCls, "min-h-[140px]")} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* Селекты */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Select label="Статус тайтла" value={status} onChange={setStatus} items={RU_STATUS} theme={theme} />
              <Select label="Статус перевода" value={trStatus} onChange={setTrStatus} items={TR_STATUS} theme={theme} />
              <Select label="Возрастное ограничение" value={age} onChange={setAge} items={AGE} theme={theme} />
              <div>
                <div className={cn("mb-1 text-sm", label)}>Год релиза</div>
                <input
                  className={inputCls}
                  type="number"
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  value={year}
                  onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
                />
              </div>
              <Select label="Тип" value={kind} onChange={setKind} items={TYPES} theme={theme} />
            </div>

            {/* ЖАНРЫ / ТЕГИ */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <PickTokens
                title="Жанры"
                theme={theme}
                values={genres}
                setValues={setGenres}
                placeholder="добавьте жанр и Enter"
                quick={DEFAULT_GENRES}
              />
              <PickTokens
                title="Теги"
                theme={theme}
                values={tags}
                setValues={setTags}
                placeholder="добавьте тег и Enter"
                quick={DEFAULT_TAGS}
              />
            </div>

            {/* Переводчики */}
            <div>
              <div className={cn("mb-1 text-sm", label)}>Переводчики</div>
              <div className="mb-2 flex flex-wrap gap-2">
                {translators.length === 0 ? <span className={cn("text-sm", muted)}>Пока не выбрано</span> : null}
                {translators.map((t) => (
                  <span
                    key={String(t.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                      theme === "light"
                        ? "bg-white border-gray-300 text-gray-800"
                        : "bg-slate-900 border-white/10 text-white"
                    )}
                  >
                    <User className="h-4 w-4 opacity-70" />
                    <span className="max-w-[200px] truncate">{t.name}</span>
                    <button
                      className="opacity-70 hover:opacity-100"
                      onClick={() => removeTranslator(t.id)}
                      aria-label="Удалить переводчика"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input
                  className={inputCls}
                  value={translatorQuery}
                  onChange={(e) => setTranslatorQuery(e.target.value)}
                  placeholder="Найдите команду по названию/слагу…"
                />
                {translatorResults.length > 0 && (
                  <div
                    className={cn(
                      "absolute z-10 mt-1 w-full overflow-hidden rounded-xl border",
                      theme === "light" ? "bg-white border-gray-200" : "bg-slate-900 border-white/10 text-white"
                    )}
                  >
                    {translatorResults.map((t) => (
                      <button
                        key={t.id as any}
                        type="button"
                        onClick={() => addTranslator(t)}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm",
                          theme === "light" ? "hover:bg-gray-50" : "hover:bg-white/10"
                        )}
                      >
                        {t.name} {t.slug ? <span className="opacity-70">({t.slug})</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ссылки + сообщение */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <TokenInput
                label="Ссылки на оригинал (для модерации)"
                theme={theme}
                values={origLinks}
                placeholder="вставьте ссылку и Enter"
                onChange={setOrigLinks}
              />
              <div>
                <div className={cn("mb-1 text-sm", label)}>Сообщение для модераторов</div>
                <textarea
                  className={cn(inputCls, "min-h-[120px]")}
                  placeholder="Источник названия/обложки и причина правок"
                  value={modMessage}
                  onChange={(e) => setModMessage(e.target.value)}
                />
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={submitForModeration}
                disabled={saving}
                className={cn("rounded-lg px-4 py-2 text-sm font-medium", primaryBtn, saving && "opacity-60 cursor-not-allowed")}
              >
                Отправить на модерацию
              </button>
              <Link href={`/title/${mangaId}`} className={cn("rounded-lg px-4 py-2 text-sm border", secondaryBtn)}>
                Отмена
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====== мелкие UI ====== */
function Select<T extends readonly string[]>({
  label,
  value,
  onChange,
  items,
  theme,
}: {
  label: string;
  value: T[number] | "";
  onChange: (v: T[number] | "") => void;
  items: T;
  theme: "light" | "dark";
}) {
  const cls =
    theme === "light"
      ? "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
      : "w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20";
  return (
    <div>
      <div className={`mb-1 text-sm ${theme === "light" ? "text-gray-700" : "text-gray-100"}`}>{label}</div>
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value as any)}>
        <option value="">—</option>
        {items.map((it) => (
          <option value={it} key={it}>
            {it}
          </option>
        ))}
      </select>
    </div>
  );
}

function TokenInput({
  label,
  theme,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  theme: "light" | "dark";
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [val, setVal] = useState("");
  const inputCls =
    theme === "light"
      ? "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
      : "w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20";
  const chip =
    theme === "light"
      ? "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800"
      : "inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-300";

  const add = () => {
    const s = val.trim();
    if (!s) return;
    if (!values.includes(s)) onChange([...values, s]);
    setVal("");
  };
  const remove = (s: string) => onChange(values.filter((x) => x !== s));

  return (
    <div>
      <div className={`mb-1 text-sm ${theme === "light" ? "text-gray-700" : "text-gray-100"}`}>{label}</div>
      <div className="flex gap-2">
        <input
          className={`${inputCls} flex-1`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={add}
          className={`rounded px-3 py-2 text-sm ${theme === "light" ? "bg-slate-900 text-white" : "bg-white text-black"}`}
        >
          +
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {values.map((s) => (
          <span key={s} className={chip}>
            {s}
            <button type="button" onClick={() => remove(s)} className="ml-1 hover:opacity-80">
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function PickTokens({
  title,
  theme,
  values,
  setValues,
  placeholder,
  quick,
}: {
  title: string;
  theme: "light" | "dark";
  values: string[];
  setValues: (v: string[]) => void;
  placeholder: string;
  quick: readonly string[];
}) {
  return (
    <div>
      <div className={`mb-1 text-sm ${theme === "light" ? "text-gray-700" : "text-gray-100"}`}>{title}</div>
      <TokenInput label="" theme={theme} values={values} onChange={setValues} placeholder={placeholder} />
      <div className="mt-2 max-h-44 overflow-auto rounded-lg border border-white/10 p-2 text-xs">
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => {
            const active = values.includes(q);
            return (
              <button
                key={q}
                type="button"
                onClick={() => setValues(active ? values.filter((x) => x !== q) : [...values, q])}
                className={`rounded-full px-2 py-1 ${
                  theme === "light"
                    ? active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-gray-800 hover:bg-slate-200"
                    : active
                    ? "bg-blue-500/30 text-blue-200"
                    : "bg-slate-800/60 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {q}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

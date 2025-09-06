// app/manga/[id]/chapter/[chapter]/page.tsx
import { notFound } from "next/navigation";
import ChapterReader from "@/components/ChapterReader";

export const dynamic = "force-dynamic";

type Params = { id: string; chapter: string };

/** Берём число из "76" или "76-risou-no-himo" */
function parseFirstNumber(raw?: string | string[] | null): number | null {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const m = s.match(/^\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function Page({ params }: { params: Params }) {
  const mangaId = parseFirstNumber(params.id);       // оставлено на будущее
  const chapterId = parseFirstNumber(params.chapter);
  if (chapterId == null) notFound();

  return (
    <main className="min-h-screen">
      <ChapterReader chapterId={chapterId} />
    </main>
  );
}

export async function generateMetadata({ params }: { params: Params }) {
  const chapterId = parseFirstNumber(params.chapter);
  return {
    title: chapterId ? `Чтение главы #${chapterId} — MangaPulse` : "Чтение — MangaPulse",
  };
}

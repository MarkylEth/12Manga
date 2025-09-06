// app/manga/[id]/page.tsx
import { notFound } from "next/navigation";
import MangaTitlePage from "@/components/MangaTitlePage";

export const dynamic = "force-dynamic";

type Params = { id: string };

function parseNumericId(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/^\d+/);
  if (!m) return null;
  const id = Number(m[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function Page({ params }: { params: Params }) {
  const mangaId = parseNumericId(params.id);
  if (mangaId == null) notFound();

  return (
    <main className="min-h-screen">
      <MangaTitlePage mangaId={mangaId} />
    </main>
  );
}

export async function generateMetadata({ params }: { params: Params }) {
  const id = parseNumericId(params.id);
  return { title: id ? `Title #${id} — MangaPulse` : "Title — MangaPulse" };
}

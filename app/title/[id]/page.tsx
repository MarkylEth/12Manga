// app/title/[id]/page.tsx
import type { Metadata } from "next";
import MangaTitlePage from "@/components/MangaTitlePage";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <MangaTitlePage mangaId={Number(id)} />;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Тайтл #${id}` };
}

// app/title/[id]/layout.tsx
import { use } from "react";

export default function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <div data-title-id={id}>{children}</div>;
}

// app/team/[slug]/page.tsx
import TeamClientPage from '@/components/team/TeamClientPage'

export default function Page({ params }: { params: { slug: string } }) {
  return <TeamClientPage slug={params.slug} />
}

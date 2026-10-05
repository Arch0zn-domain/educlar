import Link from 'next/link';
import { alumniList } from '@/lib/read';
import { PageHeading, Section, Badge, Empty } from '@/components/ui';
export const metadata = { title: 'Absolvenți' };
export default async function Alumni() {
  const list = await alumniList();
  return <div className="container page-content"><PageHeading eyebrow="UN VIITOR, MULTE DRUMURI" title="Trasee care inspiră." description="Povești publicate voluntar de absolvenți majori. Informațiile despre carieră sunt autodeclarate."><Link className="button" href="/cont?sectiune=absolvent">Adaugă povestea ta</Link></PageHeading>
    {list.map((a, i) => <Section key={i} title={a.public_name} description={`Promoția ${a.graduation} · ${a.university}`}><div className="tags"><Badge tone="gray">Autodeclarat</Badge>{a.demo && <Badge tone="amber">Profil fictiv · demo</Badge>}</div><p>{a.bio}</p><p>Domeniu: {a.field}</p><Link className="text-link" href={`/scoli/${a.school_id}`}>{a.school_name}</Link></Section>)}{!list.length && <Empty title="Prima poveste poate fi a ta."/>}
  </div>;
}

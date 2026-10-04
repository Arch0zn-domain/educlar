import Link from 'next/link';
import { PageHeading } from './ui';
import { legal } from '@/lib/legal';
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="container page-content legal-page"><PageHeading eyebrow="ÎNCREDERE ȘI TRANSPARENȚĂ" title={title} description={`Versiune de test · actualizată la ${legal.updated}`}/>
    <div className="notice amber"><strong>Documente pentru prototip.</strong> Operator: {legal.operator}. Adresă: {legal.address}. Email de test: {legal.email} (nu primește mesaje). Pentru testarea solicitărilor, folosește <Link className="text-link" href="/solicitari">formularul local</Link>. Datele operatorului și documentele trebuie validate și înlocuite înainte de lansare.</div>
    <nav className="legal-nav" aria-label="Documente legale"><Link href="/termeni">Termeni</Link><Link href="/confidentialitate">Confidențialitate și GDPR</Link><Link href="/cookies">Cookies</Link><Link href="/solicitari">Solicitări</Link></nav>
    <article className="legal-copy">{children}</article>
  </div>;
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { Login } from '@/components/login';
export const metadata = { title: 'Autentificare' };
export default async function Authentication() {
  if (await currentUser()) redirect('/cont');
  return <div className="container login-layout"><div className="login-copy"><div className="eyebrow">COMUNITATEA EDUCLAR</div><h1>Următorul pas începe cu tine.</h1><p>Salvează experiențe, trimite cereri de meditații și contribuie la comunitate.</p><div className="notice amber">Demonstrație locală. Folosește conturile fictive de test; SMS-ul este simulat.</div><p className="small">Consultă <Link className="text-link" href="/termeni">termenii și condițiile</Link> și <Link className="text-link" href="/confidentialitate">politica de confidențialitate</Link>.</p></div><div className="login-card"><Login/></div></div>;
}

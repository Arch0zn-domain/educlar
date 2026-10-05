import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { dashboard } from '@/lib/read';
import { PageHeading, Form, Field, Submit, Notice } from '@/components/ui';
import { Logout } from '@/components/login';
import { accountHref, accountSection, primaryAccountRole } from '@/lib/account-center';
import { legal } from '@/lib/legal';
export const metadata = { title: 'Contul meu' };
export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser(); if (!user) redirect('/autentificare');
  const p = await searchParams, data = await dashboard(user.id), profile = data.profile;
  if (profile?.disabled) return <div className="container page-content"><PageHeading title="Contul este dezactivat."/><Logout/></div>;
  if (!profile) return <div className="container page-content legal-page"><PageHeading title="Completează profilul." description="Rolul și grupa de vârstă determină funcțiile disponibile; drepturile administrative nu pot fi alese aici."/><Notice params={p}/><Form op="onboard" className="panel"><Field label="Rol"><select name="role"><option value="student">Elev</option><option value="parent">Părinte</option><option value="teacher">Profesor</option><option value="alumni">Absolvent</option></select></Field><Field label="Vârstă"><select name="age_band"><option value="adult">18 ani sau mai mult</option><option value="16to17">16–17 ani</option><option value="under16">Sub 16 ani</option></select></Field><input type="hidden" name="terms_version" value={legal.version}/><label className="check-field"><input type="checkbox" name="accept_terms" value="yes" required/><span>Am citit și accept <Link href="/termeni" className="text-link">termenii</Link> și am luat la cunoștință <Link href="/confidentialitate" className="text-link">informarea privind datele</Link>.</span></label><Submit>Creează profilul</Submit></Form><Logout/></div>;
  const role = primaryAccountRole(profile);
  const section = accountSection(role, p.sectiune || (p.teacher ? 'verificari' : undefined), profile);
  redirect(accountHref(role, section, p));
}

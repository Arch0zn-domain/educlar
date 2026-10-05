import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { dashboard } from '@/lib/read';
import { PageHeading } from '@/components/ui';
import { accountHref, accountSection, primaryAccountRole } from '@/lib/account-center';
export const metadata = { title: 'Administrare' };
export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser(); if (!user) redirect('/autentificare');
  const account = await dashboard(user.id);
  if (!account.profile?.staff_role || account.profile.disabled) return <div className="container page-content"><PageHeading title="Acces restricționat." description="Această pagină necesită un rol de moderator sau administrator."/><Link className="button" href="/cont">Înapoi în cont</Link></div>;
  const params = await searchParams, role = primaryAccountRole(account.profile);
  redirect(accountHref(role, accountSection(role, params.sectiune || 'moderare', account.profile), params));
}

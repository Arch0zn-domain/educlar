import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { adminData, dashboard, schoolOptions, teachers } from '@/lib/read';
import { accountCenters, accountHref, accountRoleForSlug, accountSection, canAccessAccountCenter, primaryAccountRole, type AccountSection } from '@/lib/account-center';
import { AccountOverview, AccountShell } from '@/components/account-shell';
import { PersonalAccountSection } from '@/components/account-sections';
import { StaffAccountSection } from '@/components/staff-account-sections';
import { Notice } from '@/components/ui';
import type { Row } from '@/lib/db';

type Props = { params: Promise<{ role: string }>; searchParams: Promise<Record<string, string | undefined>> };
export async function generateMetadata({ params }: Props) {
  const role = accountRoleForSlug((await params).role);
  return { title: role ? accountCenters[role].title : 'Contul meu' };
}

export default async function AccountCenter({ params, searchParams }: Props) {
  const role = accountRoleForSlug((await params).role);
  if (!role) notFound();
  const user = await currentUser();
  if (!user) redirect('/autentificare');
  const data = await dashboard(user.id), profile = data.profile;
  if (!profile || profile.disabled) redirect('/cont');
  const p = await searchParams;
  if (!canAccessAccountCenter(profile, role)) redirect(accountHref(primaryAccountRole(profile)));
  const section = accountSection(role, p.sectiune || (p.teacher ? 'verificari' : undefined), profile);
  if (p.sectiune && p.sectiune !== section) redirect(accountHref(role, section, { teacher: p.teacher, error: p.error, success: p.success }));
  const staffCenter = role === 'admin' || role === 'moderator';
  const staffData = staffCenter ? await adminData(user.id) : undefined;
  const families = data.families || [], requests = data.requests || [], reviews = data.reviews || [], checks = data.checks || [];
  const pending = (rows: Row[]) => rows.filter(row => row.status === 'pending' || row.status === 'guardian_pending').length;
  const counts: Partial<Record<AccountSection, number>> = staffData ? {
    moderare: staffData.reviews.length, raportari: staffData.reports.length, verificari: staffData.checks?.length || 0,
    date: staffData.privacy?.length || 0, importuri: pending(staffData.imports || []),
  } : {
    cereri: pending(requests), recenzii: pending(reviews), verificari: pending(checks),
    familie: families.filter(family => family.status === 'invited' || family.status === 'pending').length,
  };
  const metric = (title: string, value: string | number, target: AccountSection, detail: string) => ({ title, value, section: target, detail });
  const metrics = role === 'admin' ? [
    metric('Verificări în așteptare', counts.verificari || 0, 'verificari', 'Dovezi și revendicări de profil'),
    metric('Contribuții de analizat', counts.moderare || 0, 'moderare', 'Recenzii și răspunsuri'),
    metric('Raportări deschise', counts.raportari || 0, 'raportari', 'Sesizările comunității'),
  ] : role === 'moderator' ? [
    metric('Contribuții de analizat', counts.moderare || 0, 'moderare', 'Recenzii și răspunsuri'),
    metric('Raportări deschise', counts.raportari || 0, 'raportari', 'Sesizările comunității'),
  ] : role === 'teacher' ? [
    metric('Profil profesional', data.teacher ? 'Revendicat' : 'Nerevendicat', 'profil', data.teacher?.name || 'Asociază profilul cu acest cont'),
    metric('Oferte active', data.ownOffers?.filter(offer => offer.active).length || 0, 'oferte', 'Vizibile în catalogul de meditații'),
    metric('Cereri în așteptare', counts.cereri || 0, 'cereri', 'Răspunde din secțiunea de cereri'),
  ] : role === 'parent' ? [
    metric('Legături de familie', families.length, 'familie', `${families.filter(family => family.status === 'approved' && family.parent_consented).length} autorizate`),
    metric('Recenzii de autorizat', reviews.filter(review => !review.own && review.status === 'guardian_pending').length, 'recenzii', 'Contribuțiile copilului în așteptare'),
    metric('Cereri de meditații', requests.length, 'cereri', `${counts.cereri || 0} în așteptare`),
  ] : role === 'alumni' ? [
    metric('Povestea mea', data.alumni?.published ? 'Publică' : 'Privată', 'absolvent', data.alumni ? 'Tu alegi vizibilitatea profilului' : 'Completează traseul tău după liceu'),
    metric('Recenzii publicate', reviews.filter(review => review.status === 'approved').length, 'recenzii', 'Experiențe împărtășite comunității'),
    metric('Verificări în așteptare', counts.verificari || 0, 'verificari', 'Legătura ta cu școala și profesorii'),
  ] : [
    metric('Cereri de meditații', requests.length, 'cereri', `${counts.cereri || 0} în așteptare`),
    metric('Recenziile tale', reviews.length, 'recenzii', `${reviews.filter(review => review.status === 'approved').length} publicate`),
    metric('Verificări aprobate', checks.filter(check => check.status === 'approved').length, 'verificari', 'Apartenență și relații confirmate'),
  ];
  const needsSchools = !staffCenter && ['familie', 'verificari', 'absolvent'].includes(section);
  const [schools, teacherOptions] = await Promise.all([needsSchools ? schoolOptions() : Promise.resolve([]), !staffCenter && section === 'verificari' ? teachers() : Promise.resolve([])]);
  const returnTo = accountHref(role, section, { teacher: p.teacher });

  return <AccountShell role={role} section={section} profile={profile} counts={counts}>
    <Notice params={p}/>
    {section === 'overview' ? <AccountOverview role={role} counts={counts} metrics={metrics} primary={role === 'teacher' && !data.teacher ? 'verificari' : undefined} hint={role === 'alumni' ? 'Povestea rămâne privată până când alegi să o publici.' : undefined}>
      {role === 'student' && profile.age_band === 'under16' && <div className="notice account-guidance"><strong>Învățarea începe cu sprijinul tutorelui.</strong><p>Recenziile și cererile de meditații necesită autorizarea tutorelui.</p><Link className="text-link" href={accountHref(role, 'familie')}>Gestionează legătura cu tutorele</Link></div>}
      {role === 'parent' && families.some(family => family.status === 'invited') && <div className="notice account-guidance"><strong>Ai o invitație de tutelă.</strong><p>Deschide secțiunea copiilor pentru a accepta invitația și a solicita verificarea.</p><Link className="text-link" href={accountHref(role, 'familie')}>Vezi invitațiile</Link></div>}
    </AccountOverview> : staffData && section !== 'setari' ? <StaffAccountSection section={section} data={staffData} returnTo={returnTo}/> : <PersonalAccountSection role={role} section={section} data={{ ...data, profile }} userId={user.id} schools={schools} staff={teacherOptions} params={p} returnTo={returnTo}/>}
  </AccountShell>;
}

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Database, Flag, History, House, LockKeyhole, MessageSquare, MessageSquareText, ShieldCheck, Upload, UserRound, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logout } from '@/components/login';
import { accountCenters, accountHref, accountNavItem, type AccountIcon, type AccountRole, type AccountSection } from '@/lib/account-center';
import { label } from '@/lib/labels';
import type { Row } from '@/lib/db';

const icons = { home: House, messages: MessageSquare, reviews: MessageSquareText, family: UsersRound, shield: ShieldCheck, offers: BriefcaseBusiness, profile: UserRound, privacy: LockKeyhole, reports: Flag, sources: Database, imports: Upload, history: History };
export function AccountSymbol({ icon, size = 19 }: { icon: AccountIcon; size?: number }) {
  const Icon = icons[icon];
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true"/>;
}

export function AccountShell({ role, section, profile, counts, children }: { role: AccountRole; section: AccountSection; profile: Row; counts: Partial<Record<AccountSection, number>>; children: ReactNode }) {
  const center = accountCenters[role], current = accountNavItem(role, section);
  const staff = role === 'admin' || role === 'moderator';
  return <div className={`container page-content account-center account-${role}`}>
    <div className="account-topline"><Link href="/" className="text-link"><BookOpen size={15}/> EduClar</Link><span>Spațiul tău · {center.name}</span></div>
    <div className="account-heading"><div><div className="eyebrow">{staff ? 'ECHIPA EDUCLAR' : 'CONTUL MEU'} / {center.name.toLocaleUpperCase('ro-RO')}</div><h1>{section === 'overview' ? center.title : current.title}</h1><p>{section === 'overview' ? center.description : current.description}</p></div><span className="account-role-badge"><AccountSymbol icon={center.icon}/>{center.name}</span></div>
    <div className="account-workspace">
      <aside className="account-sidebar">
        <div className="account-identity"><span className="account-identity-icon"><AccountSymbol icon={center.icon} size={24}/></span><div><strong>{center.name}</strong><small>{label(profile.age_band)}</small></div></div>
        <nav className="account-menu" aria-label="Secțiunile contului">{center.navigation.map(item => <Link key={item.section} href={accountHref(role, item.section)} aria-current={section === item.section ? 'page' : undefined}><AccountSymbol icon={item.icon}/><span>{item.title}</span>{!!counts[item.section] && <span className="account-count">{counts[item.section]}</span>}</Link>)}</nav>
        <div className="account-sidebar-bottom">{staff && <Link className="text-link" href={accountHref(profile.role as AccountRole)}>Deschide contul personal <ArrowUpRight size={14}/></Link>}{!staff && profile.staff_role && <Link className="text-link" href={accountHref(profile.staff_role)}>Deschide {profile.staff_role === 'admin' ? 'administrarea' : 'moderarea'} <ArrowUpRight size={14}/></Link>}<Logout/></div>
      </aside>
      <div className="account-main" key={section}>{children}</div>
    </div>
  </div>;
}

export function AccountOverview({ role, counts, metrics, primary, hint, children }: { role: AccountRole; counts: Partial<Record<AccountSection, number>>; metrics: { title: string; value: number | string; section: AccountSection; detail: string }[]; primary?: AccountSection; hint?: string; children?: ReactNode }) {
  const center = accountCenters[role], action = primary || center.primary;
  const tools = center.navigation.filter(item => item.section !== 'overview' && item.section !== 'setari' && item.section !== 'istoric');
  return <>
    <section className="account-welcome"><div><span className="account-kicker">BINE AI REVENIT</span><h2>{center.welcome}</h2><p>{center.intro}</p><Link className="button" href={accountHref(role, action)}>{accountNavItem(role, action).title}<ArrowRight size={17}/></Link>{hint && <span className="account-hint">{hint}</span>}</div><div className="account-welcome-art" aria-hidden="true"><AccountSymbol icon={center.icon} size={54}/><span className="account-art-dot"/><span className="account-art-ring"/></div></section>
    <div className="account-metrics">{metrics.map(metric => <Link key={metric.title} href={accountHref(role, metric.section)} className="account-metric"><span>{metric.title}<ArrowUpRight size={15}/></span><strong>{metric.value}</strong><small>{metric.detail}</small></Link>)}</div>
    {children}
    <div className="account-section-label"><h2>Instrumentele tale</h2><span>Alege ce vrei să faci</span></div>
    <div className="account-tools">{tools.map(item => <Link className="account-tool" href={accountHref(role, item.section)} key={item.section}><span className="account-tool-icon"><AccountSymbol icon={item.icon} size={23}/></span><div><h3>{item.title}</h3><p>{item.description}</p>{!!counts[item.section] && <small>{counts[item.section]} în așteptare</small>}</div><ArrowUpRight size={18}/></Link>)}</div>
  </>;
}

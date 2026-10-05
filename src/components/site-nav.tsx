'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/scoli', label: 'Școli' },
  { href: '/profesori', label: 'Profesori' },
  { href: '/meditatii', label: 'Meditații' },
  { href: '/absolventi', label: 'Absolvenți' },
  { href: '/asistent', label: 'Jelly AI' },
];

export function SiteNav() {
  const pathname = usePathname();
  return <nav aria-label="Navigare principală">{links.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}>{label}</Link>)}</nav>;
}

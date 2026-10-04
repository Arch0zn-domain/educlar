import Link from 'next/link';
export default function NotFound() { return <div className="container page-content"><h1>Pagina nu a fost găsită.</h1><p>Linkul poate fi vechi sau profilul a fost retras.</p><Link className="button" href="/">Revino la pagina principală</Link></div>; }

export type AccountRole = 'student' | 'parent' | 'teacher' | 'alumni' | 'admin' | 'moderator';
export type AccountSection = 'overview' | 'cereri' | 'recenzii' | 'familie' | 'verificari' | 'oferte' | 'profil' | 'absolvent' | 'date' | 'moderare' | 'raportari' | 'surse' | 'importuri' | 'istoric' | 'setari';
export type AccountIcon = 'home' | 'messages' | 'reviews' | 'family' | 'shield' | 'offers' | 'profile' | 'privacy' | 'reports' | 'sources' | 'imports' | 'history';
export type AccountNavItem = { section: AccountSection; title: string; description: string; icon: AccountIcon };
type AccountCenter = { slug: string; name: string; title: string; description: string; welcome: string; intro: string; icon: AccountIcon; primary: AccountSection; navigation: AccountNavItem[] };
export type AccountProfile = { role: 'student' | 'parent' | 'teacher' | 'alumni'; staff_role?: 'admin' | 'moderator' | null; age_band: 'under16' | '16to17' | 'adult'; disabled: boolean };

const overview: AccountNavItem = { section: 'overview', title: 'Privire de ansamblu', description: 'Tot ce contează acum, într-un singur loc.', icon: 'home' };
const requests: AccountNavItem = { section: 'cereri', title: 'Cereri de meditații', description: 'Urmărește cererile și discută cu profesorul potrivit.', icon: 'messages' };
const reviews: AccountNavItem = { section: 'recenzii', title: 'Recenziile mele', description: 'Experiențele tale și stadiul publicării lor.', icon: 'reviews' };
const verification: AccountNavItem = { section: 'verificari', title: 'Verificările mele', description: 'Confirmă apartenența școlară și relația cu profesorii.', icon: 'shield' };
const privacy: AccountNavItem = { section: 'setari', title: 'Cont și confidențialitate', description: 'Datele tale, solicitările și opțiunile contului.', icon: 'privacy' };
const alumni: AccountNavItem = { section: 'absolvent', title: 'Povestea mea', description: 'Editează povestea și alege când devine publică.', icon: 'profile' };
const moderation: AccountNavItem = { section: 'moderare', title: 'Recenzii și răspunsuri', description: 'Analizează contribuțiile înainte de publicare.', icon: 'reviews' };
const reports: AccountNavItem = { section: 'raportari', title: 'Raportări', description: 'Soluționează sesizările comunității.', icon: 'reports' };

export const accountCenters: Record<AccountRole, AccountCenter> = {
  student: {
    slug: 'elev', name: 'Elev', title: 'Spațiul elevului', description: 'Profesorii potriviți, experiențele tale și următorul pas în educație.',
    welcome: 'Următorul tău pas începe aici.', intro: 'Găsește sprijin la învățare, urmărește cererile de meditații și împărtășește experiențele tale.', icon: 'profile', primary: 'cereri',
    navigation: [overview, requests, reviews, verification, { section: 'familie', title: 'Tutorele meu', description: 'Invită un tutore și urmărește autorizarea contului.', icon: 'family' }, privacy],
  },
  parent: {
    slug: 'parinte', name: 'Părinte', title: 'Spațiul părintelui', description: 'Un loc dedicat familiei și alegerilor educaționale ale copilului.',
    welcome: 'Mai aproape de parcursul copilului.', intro: 'Gestionează legăturile de familie, autorizează contribuțiile copilului și urmărește cererile de meditații.', icon: 'family', primary: 'familie',
    navigation: [overview, { section: 'familie', title: 'Copiii și autorizările', description: 'Gestionează copiii, invitațiile și legăturile de tutelă.', icon: 'family' }, requests, { ...reviews, title: 'Recenziile familiei', description: 'Experiențele tale și contribuțiile copilului care așteaptă acordul tău.' }, verification, privacy],
  },
  teacher: {
    slug: 'profesor', name: 'Profesor', title: 'Spațiul profesorului', description: 'Profilul profesional, ofertele tale și cererile primite de la comunitate.',
    welcome: 'Experiența ta merită să fie văzută.', intro: 'Ține profilul profesional la zi, publică oferte de meditații și răspunde cererilor primite.', icon: 'offers', primary: 'profil',
    navigation: [overview, { section: 'profil', title: 'Profilul meu profesional', description: 'Vezi profilul public și gestionează datele profesionale.', icon: 'profile' }, { section: 'oferte', title: 'Ofertele mele', description: 'Publică și actualizează ofertele de meditații.', icon: 'offers' }, { ...requests, title: 'Cereri primite', description: 'Acceptă sau refuză cererile pentru ofertele tale.' }, { ...verification, title: 'Revendicare și verificări', description: 'Revendică profilul sau solicită corectarea datelor profesionale.' }, privacy],
  },
  alumni: {
    slug: 'absolvent', name: 'Absolvent', title: 'Spațiul absolventului', description: 'Povestea ta, traseul profesional și legătura cu școala.',
    welcome: 'Povestea ta poate deschide un drum.', intro: 'Împărtășește ce ai ales după liceu și oferă generațiilor următoare o perspectivă din propria experiență.', icon: 'profile', primary: 'absolvent',
    navigation: [overview, alumni, reviews, verification, requests, privacy],
  },
  admin: {
    slug: 'administrator', name: 'Administrator', title: 'Centrul de administrare', description: 'Verificări, moderare și surse de date, într-un spațiu dedicat echipei.',
    welcome: 'O comunitate de încredere începe aici.', intro: 'Vezi ce așteaptă o decizie și deschide direct verificările, contribuțiile sau solicitările de date.', icon: 'shield', primary: 'verificari',
    navigation: [overview, moderation, reports, { section: 'verificari', title: 'Verificări manuale', description: 'Analizează dovezile și revendicările de profil.', icon: 'shield' }, { section: 'date', title: 'Solicitări privind datele', description: 'Analizează cererile de confidențialitate și sesizările.', icon: 'privacy' }, { section: 'surse', title: 'Registrul surselor', description: 'Înregistrează și validează sursele de date.', icon: 'sources' }, { section: 'importuri', title: 'Importuri', description: 'Validează, previzualizează și publică loturile de date.', icon: 'imports' }, { section: 'istoric', title: 'Istoricul deciziilor', description: 'Consultă motivele și datele deciziilor echipei.', icon: 'history' }, privacy],
  },
  moderator: {
    slug: 'moderator', name: 'Moderator', title: 'Centrul de moderare', description: 'Contribuțiile și raportările comunității, pregătite pentru analiză.',
    welcome: 'Ajută conversațiile să rămână utile.', intro: 'Analizează recenziile și răspunsurile profesorilor, apoi soluționează raportările comunității.', icon: 'reviews', primary: 'moderare',
    navigation: [overview, moderation, reports, privacy],
  },
};

export function primaryAccountRole(profile: AccountProfile): AccountRole {
  if (profile.staff_role === 'admin' || profile.staff_role === 'moderator') return profile.staff_role;
  return profile.role;
}

export function accountRoleForSlug(slug: string): AccountRole | undefined {
  return (Object.keys(accountCenters) as AccountRole[]).find(role => accountCenters[role].slug === slug);
}

export function canAccessAccountCenter(profile: AccountProfile, role: AccountRole): boolean {
  if (profile.disabled) return false;
  return role === 'admin' || role === 'moderator' ? profile.staff_role === role : profile.role === role;
}

export function accountHref(role: AccountRole, section: AccountSection = 'overview', params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && key !== 'sectiune') query.set(key, value);
  if (section !== 'overview') query.set('sectiune', section);
  return `/cont/${accountCenters[role].slug}${query.size ? `?${query}` : ''}`;
}

export function accountSection(role: AccountRole, requested: string | undefined, profile: AccountProfile): AccountSection {
  if (requested === 'date' && role !== 'admin') return 'setari';
  if (accountCenters[role].navigation.some(item => item.section === requested)) return requested as AccountSection;
  // Keep personal contributions available without crowding the professional dashboard.
  if (role !== 'admin' && role !== 'moderator') {
    if (requested === 'recenzii') return 'recenzii';
    if (requested === 'absolvent' && profile.age_band === 'adult') return 'absolvent';
  }
  return 'overview';
}

export function accountNavItem(role: AccountRole, section: AccountSection): AccountNavItem {
  return accountCenters[role].navigation.find(item => item.section === section) || (section === 'absolvent' ? alumni : section === 'recenzii' ? reviews : overview);
}

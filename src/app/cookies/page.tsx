import { LegalPage } from '@/components/legal';
import { CookieSettingsButton } from '@/components/preferences';
export const metadata = { title: 'Politica de cookies' };
export default function Cookies() {
  return <LegalPage title="Politica de cookies"><p>Cookies sunt informații salvate de browser. Folosim și localStorage, pentru care explicăm scopul și perioada de păstrare. Nu încărcăm instrumente de analytics, pixeli de marketing sau reclame.</p>
    <div className="table-wrap"><table><thead><tr><th>Element</th><th>Scop și categorie</th><th>Durată</th></tr></thead><tbody>
      <tr><td>better-auth.session_token</td><td>Cookie necesar pentru autentificare; protejat HttpOnly. Se setează la autentificare.</td><td>7 zile, reînnoibil în timpul utilizării</td></tr>
      <tr><td>educlar-cookies</td><td>localStorage necesar pentru memorarea alegerii; include versiunea și data</td><td>180 de zile; apoi solicităm o nouă alegere</td></tr>
      <tr><td>educlar-compare</td><td>localStorage pentru comparația școlilor cerută de utilizator</td><td>Până la eliminarea selecției sau ștergerea din browser</td></tr>
      <tr><td>educlar-theme</td><td>localStorage opțional pentru preferința Light, Dark sau Sistem</td><td>Până la retragerea acordului, expirarea alegerii sau ștergerea din browser</td></tr>
    </tbody></table></div>
    <h2>Alegerea ta</h2><p>„Doar necesare” păstrează funcțiile de bază. „Acceptă preferințele” permite și reținerea temei. Poți schimba tema în pagina curentă fără să accepți stocarea ei permanentă. Preferințele opționale sunt oprite până la alegerea ta. La retragere, ștergem tema salvată; la expirare, aceasta nu mai este folosită. Poți șterge toate datele locale din setările browserului.</p><CookieSettingsButton/>
    <h2>Reguli aplicabile</h2><p>Stocarea care nu este necesară pentru serviciul solicitat necesită acord prealabil. Poți refuza sau retrage preferințele fără să pierzi accesul la catalog. Pentru viitoare servicii de analytics ori marketing vor fi necesare informare și alegeri distincte. <a href="https://legislatie.just.ro/Public/DetaliiDocumentAfis/214211" target="_blank" rel="noreferrer">Legea nr. 506/2004, art. 4</a>.</p>
  </LegalPage>;
}

import type { Query } from './db';

const schoolOfficialId = '4061101539';
export const curatedTeachers = [
  {
    id: 'elena-hulber', name: 'Elena Hulber', subject: 'Geografie',
    bio: 'Profesoară de geografie. Profil propus de un fost elev al Școlii Gimnaziale nr. 79, București; sursele și informațiile furnizate de contributor sunt prezentate mai jos.',
    facts: [
      { text: 'Radio România Cultural o prezintă ca profesoară de geografie și invitată la un eveniment Humanitas din 13 aprilie 2024.', status: 'public', title: 'Radio România Cultural · 9 aprilie 2024', url: 'https://www.radioromaniacultural.ro/sectiuni-articole/literatura/evenimente-in-luna-aprilie-la-librariile-humanitas-id43122.html' },
      { text: 'Apare ca diriginte/coordonator în programul Școala Altfel al Școlii Gimnaziale nr. 79 din aprilie 2014. Documentul confirmă asocierea istorică, fără a stabili situația actuală.', status: 'public', title: 'Școala nr. 79 · Școala Altfel 2014, paginile 5 și 10', url: 'https://scoala79.ro/wp-content/uploads/2014/03/Scoala-altfel-2014.pdf' },
      { text: 'Predă geografie la Școala Gimnazială nr. 79, potrivit fostului elev care a propus profilul.', status: 'contributor' },
      { text: 'Absolventă a Facultății de Geografie, Universitatea din București, potrivit contributorului. Studiile nu au fost confirmate independent.', status: 'contributor' },
    ],
  },
  {
    id: 'ciprian-augustin', name: 'Ciprian Augustin', subject: 'Fizică',
    bio: 'Profesor de fizică la Școala Gimnazială nr. 79, București, potrivit fostului elev care a propus profilul. Identitatea completă și studiile așteaptă confirmare.',
    facts: [
      { text: 'Predă fizică la Școala Gimnazială nr. 79, potrivit contributorului. Asocierea nu a fost confirmată printr-o sursă profesională publică.', status: 'contributor' },
      { text: 'A absolvit Colegiul Național de Informatică Tudor Vianu, apoi Politehnica, în domeniul telecomunicațiilor, potrivit contributorului. Studiile nu au fost confirmate independent.', status: 'contributor' },
      { text: 'Numele este afișat în forma oferită de contributor. Nu au fost asociate biografii ale unor persoane cu nume asemănătoare.', status: 'contributor' },
    ],
  },
] as const;

// Installation is additive: claims, corrections and withdrawals must survive restarts.
export async function installCuratedTeachers(q: Query) {
  if ((await q("SELECT key FROM app_meta WHERE key='curated-school79-v1'")).length) return;
  const school = (await q('SELECT id FROM schools WHERE official_id=$1', [schoolOfficialId]))[0];
  if (!school) throw new Error('Școala nr. 79 lipsește din rețeaua oficială; profilurile nu pot fi instalate.');
  await q('BEGIN');
  try {
    await q("INSERT INTO sources(id,title,url,publisher,year,license,status,demo) VALUES('curated-school79','Profiluri propuse de un fost elev · proveniență pe fiecare informație','/profesori','Contributor EduClar',2026,'Rezumate factuale; fără republicarea articolelor sau fotografiilor','approved',false) ON CONFLICT(id) DO NOTHING");
    for (const t of curatedTeachers) {
      const sourceKey = `contributor-school79:${t.id}`;
      if ((await q('SELECT source_key FROM suppressions WHERE source_key=$1', [sourceKey])).length) continue;
      const inserted = await q("INSERT INTO teachers(id,source_key,name,subjects,bio,source_id,demo) VALUES($1,$2,$3,$4,$5,'curated-school79',false) ON CONFLICT DO NOTHING RETURNING id", [t.id, sourceKey, t.name, JSON.stringify([t.subject]), t.bio]);
      if (inserted.length) await q('INSERT INTO affiliations(teacher_id,school_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [t.id, school.id]);
    }
    await q("INSERT INTO app_meta(key,value) VALUES('curated-school79-v1','complete') ON CONFLICT DO NOTHING");
    await q('COMMIT');
  } catch (error) { await q('ROLLBACK'); throw error; }
}

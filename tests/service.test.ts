import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, type Query } from '../src/lib/db';
import { Service } from '../src/lib/service';
import { stageImport, publishImport } from '../src/lib/imports';
import { legal } from '../src/lib/legal';
let db: Awaited<ReturnType<typeof openDatabase>>, s: Service, q: Query, directory: string;
const root = path.resolve('.data');
beforeAll(async () => {
  const { mkdir } = await import('node:fs/promises'); await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, 'unit-')); db = await openDatabase(directory, true); q = db.query; s = new Service(q);
});
beforeEach(async () => { await q('BEGIN'); });
afterEach(async () => { await q('ROLLBACK'); });
afterAll(async () => {
  await db?.close();
  if (directory && path.resolve(directory).startsWith(root + path.sep) && path.basename(directory).startsWith('unit-')) await rm(directory, { recursive: true, force: true });
});
describe('server permissions and persistent workflows', () => {
  it('supports a child represented only by a parent and a separate child inviting a guardian', async () => {
    const represented = await s.family('demo-parent', { label: 'Copil în cont', school_id: 'orizont' });
    expect((await q('SELECT child_id,status,parent_consented FROM families WHERE id=$1', [represented]))[0]).toMatchObject({ child_id: null, status: 'pending', parent_consented: true });
    await expect(s.subject('demo-parent', represented)).rejects.toThrow('tutelă');
    await q("INSERT INTO documents(id,owner_id,file_name,mime) VALUES('doc-test','demo-parent','test.png','image/png')");
    const check = await s.submitCheck('demo-parent', { kind: 'guardian', family_id: represented, academic_year: '2025–2026' }, 'doc-test');
    await s.decideCheck('demo-admin', check, true, 'Relație de tutelă demonstrativă verificată.');
    expect((await s.subject('demo-parent', represented)).f.id).toBe(represented);
    const invited = await s.family('demo-student', { label: 'Elev cu telefon', school_id: 'orizont', parent_phone: '+40700000002' });
    await s.acceptFamily('demo-parent', invited);
    expect((await q('SELECT parent_id,status,invited_phone FROM families WHERE id=$1', [invited]))[0]).toMatchObject({ parent_id: 'demo-parent', status: 'pending', invited_phone: null });
  });
  it('account deletion removes contacts, revokes sessions and retracts the alumni profile', async () => {
    const rid = await s.privacy('demo-alumni', { kind: 'account', contact: 'test@example.invalid', message: 'Solicit ștergerea contului meu demonstrativ.' });
    await s.privacyDecision('demo-admin', rid, true, 'Titular verificat și cerere soluționată.');
    expect((await q("SELECT phone_number FROM auth_user WHERE id='demo-alumni'"))[0].phone_number).toBeNull();
    expect((await q("SELECT disabled FROM profiles WHERE user_id='demo-alumni'"))[0].disabled).toBe(true);
    expect(await q("SELECT * FROM alumni WHERE user_id='demo-alumni'")).toHaveLength(0);
  });
  it('cannot choose administrative permissions during registration and requires terms acceptance', async () => {
    await q("INSERT INTO auth_user(id,name,email) VALUES('new','Test','new@example.invalid')");
    await expect(s.onboard('new', { role: 'parent', age_band: 'adult' })).rejects.toThrow();
    await s.onboard('new', { role: 'parent', age_band: 'adult', accept_terms: 'yes', terms_version: legal.version, staff_role: 'admin' });
    expect((await q("SELECT staff_role,terms_version FROM profiles WHERE user_id='new'"))[0]).toMatchObject({ staff_role: null, terms_version: legal.version });
    await expect(s.staff('new')).rejects.toThrow('Nu ai permisiunea');
  });
  it('parents must select a verified family and cannot use someone else’s family', async () => {
    await q("INSERT INTO families(id,parent_id,label,school_id,created_by,status,parent_consented) VALUES('extra','demo-parent','Alt copil','orizont','demo-parent','approved',true)");
    expect((await s.subject('demo-parent', 'extra')).f.id).toBe('extra');
    await expect(s.subject('demo-parent')).rejects.toThrow('tutelă');
    await expect(s.subject('demo-student', 'demo-family')).rejects.toThrow('tutelă');
  });
  it('reviews cannot be published without relationship verification', async () => {
    const input = { teacher_id: 'ana-pop', context: 'class', academic_year: '2025–2026', body: 'Explicații clare și răspunsuri detaliate la întrebările noastre.', clarity: 5, respect: 5, fairness: 4, feedback: 5 };
    await expect(s.saveReview('demo-alumni', input)).rejects.toThrow('relația');
    const rid = await s.saveReview('demo-student', input); expect((await q('SELECT status FROM reviews WHERE id=$1', [rid]))[0].status).toBe('pending');
    await expect(s.moderateReview('demo-student', rid, true, 'Verificat corect')).rejects.toThrow('permisiunea');
    await s.moderateReview('demo-admin', rid, true, 'Experiență verificată în demo.');
    await s.saveReview('demo-student', { ...input, body: input.body + ' Actualizare.' });
    expect((await q('SELECT status FROM reviews WHERE id=$1', [rid]))[0].status).toBe('pending');
  });
  it('child contributions require guardian authorization and revocation blocks them', async () => {
    const rid = await s.saveReview('demo-child', { teacher_id: 'sorin-luca', context: 'class', academic_year: '2025–2026', body: 'Experiență de test cu explicații detaliate și exerciții practice.', clarity: 4, respect: 5, fairness: 5, feedback: 4 });
    expect((await q('SELECT status FROM reviews WHERE id=$1', [rid]))[0].status).toBe('guardian_pending');
    await expect(s.moderateReview('demo-admin', rid, true, 'Verificare test')).rejects.toThrow('tutore');
    await s.guardianDecision('demo-parent', 'review', rid, true);
    await s.revokeFamily('demo-parent', 'demo-family');
    expect((await q('SELECT status FROM reviews WHERE id=$1', [rid]))[0].status).toBe('rejected');
    await expect(s.subject('demo-child')).rejects.toThrow('tutelă');
  });
  it('only the offer owner can accept a tutoring request', async () => {
    const rid = await s.request('demo-student', { offer_id: 'oferta-ana', message: 'Doresc pregătire de test pentru examenul de admitere.', not_current_teacher: 'yes' });
    await expect(s.requestDecision('demo-alumni', rid, true)).rejects.toThrow('indisponibilă');
    await s.requestDecision('demo-teacher', rid, true);
    expect((await q('SELECT status FROM requests WHERE id=$1', [rid]))[0].status).toBe('accepted');
  });
  it('minor alumni profiles cannot be published', async () => {
    await expect(s.alumni('demo-child', {})).rejects.toThrow('adulților');
  });
  it('withdrawn teacher profiles stay suppressed after reimport', async () => {
    const rid = await s.privacy('demo-teacher', { kind: 'profile', teacher_id: 'ana-pop', contact: 'test@example.invalid', message: 'Solicit retragerea profilului meu demonstrativ.' });
    await s.privacyDecision('demo-admin', rid, true, 'Titular verificat, retragere aprobată.');
    const batch = await stageImport(q, 'teachers', 'demo', [{ source_key: 'demo:ana-pop', name: 'Ana Popescu', subjects: ['Matematică'], school_ids: ['orizont'], start_year: 2008 }]);
    await publishImport(q, batch);
    expect((await q("SELECT withdrawn FROM teachers WHERE id='ana-pop'"))[0].withdrawn).toBe(true);
  });
  it('anonymous deletion requests are rejected and invalid imports cannot publish', async () => {
    await expect(s.privacy(null, { kind: 'account', contact: 'test@example.invalid', message: 'Solicit ștergerea contului de test.' })).rejects.toThrow('Connectează-te');
    const invalid = await stageImport(q, 'schools', 'demo', [{ official_id: 'BAD' }]);
    await expect(publishImport(q, invalid)).rejects.toThrow('validate');
    const rows = [{ official_id: 'TEST-NEW', name: 'Școala Test', county: 'Iași', city: 'Iași', type: 'liceu' }];
    const batch = await stageImport(q, 'schools', 'demo', rows); expect(await stageImport(q, 'schools', 'demo', rows)).toBe(batch);
    await publishImport(q, batch); await publishImport(q, batch);
    expect((await q("SELECT count(*)::int AS n FROM schools WHERE official_id='TEST-NEW'"))[0].n).toBe(1);
  });
});

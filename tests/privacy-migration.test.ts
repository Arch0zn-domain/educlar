import { expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { seedDatabase } from '../src/lib/seed';
import type { Query,Row } from '../src/lib/db';

it('upgrades legacy replies and reopens privacy approvals that have no recorded deliverable',async()=>{
  const db=new PGlite();
  const q:Query=async<T extends Row=Row>(sql:string,params:unknown[]=[]) => (await db.query(sql,params)).rows as T[];
  try {
    await db.exec(await readFile('migrations/001_initial.sql','utf8'));
    await db.exec(await readFile('migrations/002_terms.sql','utf8'));
    await seedDatabase(q);
    await q("UPDATE reviews SET reply='Attributed approved reply',reply_pending='Unversioned pending reply' WHERE id='review-0'");
    await q("UPDATE reviews SET teacher_id='mihai-stan',reply='Unattributed legacy reply' WHERE id='review-1'");
    for(const kind of ['account','profile','access','correction','illegal']) {
      await q("INSERT INTO privacy_requests(id,user_id,kind,teacher_id,contact,message,status) VALUES($1,'demo-teacher',$1,'ana-pop','test@example.invalid','Legacy request','approved')",[kind]);
    }
    await q("INSERT INTO privacy_requests(id,kind,contact,message,status) VALUES('rejected','access','test@example.invalid','Rejected request','rejected')");
    await db.exec(await readFile('migrations/003_privacy_outcomes.sql','utf8'));
    expect((await q("SELECT reply,reply_author_id,reply_version,reply_pending,version FROM reviews WHERE id='review-0'"))[0]).toMatchObject({reply:'Attributed approved reply',reply_author_id:'demo-teacher',reply_version:1,reply_pending:null,version:1});
    expect((await q("SELECT reply,reply_version FROM reviews WHERE id='review-1'"))[0]).toMatchObject({reply:null,reply_version:null});
    const approvals=await q("SELECT status,outcome FROM privacy_requests WHERE id<>'rejected'");
    expect(approvals).toHaveLength(5);
    for(const row of approvals)expect(row).toMatchObject({status:'pending',outcome:{action:'legacy_approval_requires_fulfillment'}});
    expect((await q("SELECT status FROM privacy_requests WHERE id='rejected'"))[0].status).toBe('rejected');
  } finally {await db.close();}
});

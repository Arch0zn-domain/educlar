import type { Query } from './db';
import { normalize, pseudonym } from './domain';

export const demoAccounts = [
  { id: 'demo-admin', phone: '+40700000001', name: 'Administrator demo', role: 'parent', age: 'adult', staff: 'admin' },
  { id: 'demo-parent', phone: '+40700000002', name: 'Părinte demo', role: 'parent', age: 'adult', staff: null },
  { id: 'demo-student', phone: '+40700000003', name: 'Elev demo', role: 'student', age: '16to17', staff: null },
  { id: 'demo-teacher', phone: '+40700000004', name: 'Profesor demo', role: 'teacher', age: 'adult', staff: null },
  { id: 'demo-child', phone: '+40700000005', name: 'Copil demo', role: 'student', age: 'under16', staff: null },
  { id: 'demo-alumni', phone: '+40700000006', name: 'Absolvent demo', role: 'alumni', age: 'adult', staff: null },
  { id: 'demo-moderator', phone: '+40700000007', name: 'Moderator demo', role: 'parent', age: 'adult', staff: 'moderator' },
];
export async function seedDatabase(q: Query) {
  await q('BEGIN');
  try {
    await q("INSERT INTO sources(id,title,url,publisher,year,license,status,demo) VALUES('demo','Set demonstrativ EduClar','/metodologie','EduClar · date fictive',2025,'Date sintetice pentru testare','approved',true)");
    const schools = [
      ['orizont','Colegiul Național Orizont','București','București','colegiu',920],
      ['perspectiva','Liceul Teoretic Perspectiva','Cluj','Cluj-Napoca','liceu',740],
      ['lumina','Colegiul Național Lumina','Iași','Iași','colegiu',850],
      ['meridian','Liceul Teoretic Meridian','Brașov','Brașov','liceu',680],
      ['atlas','Colegiul Atlas','Timiș','Timișoara','colegiu',810],
      ['izvor','Școala Gimnazială Izvor','București','București','gimnaziu',530],
      ['busola','Liceul Teoretic Busola','Constanța','Constanța','liceu',600],
      ['viitor','Școala Gimnazială Viitor','Cluj','Cluj-Napoca','gimnaziu',450],
    ];
    for (let i=0;i<schools.length;i++) {
      const [id,name,county,city,type,enrolled] = schools[i];
      await q("INSERT INTO schools(id,official_id,name,county,city,type,enrolled,enrolled_year,source_id,demo,search_text) VALUES($1,$2,$3,$4,$5,$6,$7,'2025–2026','demo',true,$8)",[id,`DEMO-${i}`,name,county,city,type,enrolled,normalize(`${name} ${county} ${city}`)]);
      for(const year of [2024,2025]) {
        const exam = type === 'gimnaziu' ? 'EN' : 'BAC';
        const count = 120 + i*10;
        await q("INSERT INTO statistics(id,school_id,exam,year,session,candidates,attended,valid,promoted,mean,distribution,source_id,demo) VALUES($1,$2,$3,$4,'vară',$5,$6,$6,$7,$8,$9,'demo',true)",
          [`${id}-${year}`,id,exam,year,count,count-4,count-10,(9.12-i*.16+(year-2024)*.12).toFixed(2),JSON.stringify({'sub 5':6,'5–6':8,'6–7':12,'7–8':18,'8–9':26,'9–10':count-74})]);
        if(exam==='BAC') for(const [s,spec] of ['Matematică-informatică','Științe ale naturii','Filologie'].entries()) {
          await q("INSERT INTO statistics(id,school_id,exam,year,session,specialization,stage,candidates,attended,valid,minimum,mean,source_id,demo) VALUES($1,$2,'ADMITERE',$3,'iulie',$4,'repartizare computerizată',56,56,56,$5,$6,'demo',true)",
            [`${id}-adm-${year}-${s}`,id,year,spec,(9.2-i*.2-s*.15).toFixed(2),(9.5-i*.1-s*.1).toFixed(2)]);
        }
      }
    }
    for(const a of demoAccounts) {
      await q('INSERT INTO auth_user(id,name,email,email_verified,phone_number,phone_number_verified) VALUES($1,$2,$3,false,$4,true)',[a.id,a.name,`${a.id}@demo.educlar.invalid`,a.phone]);
      await q('INSERT INTO profiles(user_id,role,age_band,staff_role,pseudonym) VALUES($1,$2,$3,$4,$5)',[a.id,a.role,a.age,a.staff,pseudonym(a.id)]);
    }
    const teachers = [
      ['ana-pop','Ana Popescu','Matematică','orizont',2008,'demo-teacher'],
      ['mihai-stan','Mihai Stănescu','Limba română','orizont',2012,null],
      ['elena-marin','Elena Marinescu','Informatică','perspectiva',2015,null],
      ['andrei-dima','Andrei Dima','Fizică','lumina',null,null],
      ['ioana-matei','Ioana Matei','Biologie','meridian',2010,null],
      ['sorin-luca','Sorin Luca','Matematică','izvor',2006,null],
    ];
    for (const [id,name,subject,school,year,claimed] of teachers) {
      await q("INSERT INTO teachers(id,source_key,name,subjects,bio,start_year,experience_confirmed,source_id,claimed_by,demo) VALUES($1,$2,$3,$4,$5,$6,$7,'demo',$8,true)",
        [id,`demo:${id}`,name,JSON.stringify([subject]),'Profil fictiv pentru explorarea aplicației. Învățarea începe cu întrebări bune, explicații clare și încredere.',year,!!year,claimed]);
      await q('INSERT INTO affiliations(teacher_id,school_id) VALUES($1,$2)',[id,school]);
    }
    await q("INSERT INTO families(id,parent_id,child_id,label,school_id,created_by,status,parent_consented) VALUES('demo-family','demo-parent','demo-child','Copil demo','izvor','demo-parent','approved',true)");
    await q("INSERT INTO offers(id,teacher_id,subject,level,format,city,duration,price) VALUES('oferta-ana','ana-pop','Matematică','BAC și admitere','mixt','București',90,150)");
    for (const [id,school,teacher,family] of [['demo-student','orizont','ana-pop',null],['demo-parent','izvor','sorin-luca','demo-family'],['demo-child','izvor','sorin-luca','demo-family']]) {
      for(const kind of ['school','relationship']) await q("INSERT INTO checks(id,user_id,kind,school_id,teacher_id,family_id,academic_year,status,reason) VALUES($1,$2,$3,$4,$5,$6,'2025–2026','approved','Verificare demonstrativă; nu dovedește o identitate reală.')",[`${id}-${kind}`,id,kind,school,kind==='relationship'?teacher:null,family]);
    }
    for(let i=0;i<6;i++) {
      const id = `demo-reviewer-${i}`;
      await q('INSERT INTO auth_user(id,name,email) VALUES($1,$2,$3)',[id,'Autor fictiv',`${id}@demo.educlar.invalid`]);
      await q("INSERT INTO profiles(user_id,role,age_band,pseudonym) VALUES($1,'alumni','adult',$2)",[id,pseudonym(id)]);
      await q("INSERT INTO reviews(id,author_id,teacher_id,subject_key,context,academic_year,body,clarity,respect,fairness,feedback,status) VALUES($1,$2,'ana-pop',$2,'class','2024–2025',$3,5,5,4,5,'approved')",
        [`review-${i}`,id,['Explică pas cu pas și revine asupra lucrurilor pe care nu le-am înțeles. M-au ajutat exemplele practice.','Am apreciat feedbackul la teme și felul în care ne încuraja să punem întrebări.','Orele au o structură clară. Mi-ar fi plăcut să avem mai mult timp pentru exerciții individuale.'][i%3]]);
    }
    await q("INSERT INTO alumni(user_id,public_name,school_id,graduation,university,field,bio,published) VALUES('demo-alumni','Alexandra · profil demo','orizont',2021,'Facultatea de Informatică · exemplu','Tehnologie','De la curiozitatea pentru matematică la primele proiecte de software. Traseu fictiv, pentru demonstrație.',true)");
    await q("INSERT INTO app_meta(key,value) VALUES('seed-v1','complete')");
    await q('COMMIT');
  } catch(e) { await q('ROLLBACK'); throw e; }
}

export const labels: Record<string, string> = {
  student: 'Élève', parent: 'Părinte', teacher: 'Profesor', alumni: 'Absolvent',
  under16: 'Sub 16 ani', '16to17': '16–17 ani', adult: 'Adult',
  invited: 'Invitație trimisă', pending: 'În analiză', approved: 'Aprobat', rejected: 'Respins',
  guardian_pending: 'Așteaptă tutorele', accepted: 'Acceptat', declined: 'Refuzat', cancelled: 'Anulat',
  revoked: 'Autorizare retrasă', expired: 'Expirat', invalid: 'Invalid', published: 'Publicat',
  school: 'Apartenență școlară', relationship: 'Relație cu profesorul', claim: 'Revendicare profil', guardian: 'Tutelă',
  correction: 'Corectare / alte drepturi', account: 'Ștergere cont', profile: 'Retragere profil', illegal: 'Sesizare', access: 'Acces / portabilitate',
};
export const label = (value: string) => labels[value] || value;

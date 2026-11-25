const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/obligations.js');

const AUJ = '2026-11-25';
const trouver = (a, type, libelle) => a.echeances.find((e) => e.type === type && (!libelle || e.libelle.includes(libelle)));

test('arithmétique des dates', () => {
  assert.equal(O.ajouterMois('2026-03-31', 2), '2026-05-31');
  assert.equal(O.ajouterMois('2026-12-31', 2), '2027-02-28');
  assert.equal(O.ajouterAns('2024-02-29', 1), '2025-02-28');
  assert.equal(O.normaliserDate('05/03/2026'), '2026-03-05');
  assert.equal(O.normaliserDate(1975), '1975-01-01');
  assert.equal(O.normaliserDate(45658), '2025-01-01'); // numéro de série Excel
  assert.equal(O.nombre('12 345,50 €'), 12345.5);
});

test('registre : mise à jour dans les 2 mois suivant l\'AG', () => {
  const base = { nom: 'A', immatriculation: 'AA1234567', lotsPrincipaux: 30, dateReception: '1990-01-01' };
  let a = O.analyserCopro({ ...base, dateAGComptes: '2026-06-10' }, AUJ);
  let r = trouver(a, 'registre', 'annuelle');
  assert.equal(r.date, '2026-08-10');
  assert.equal(r.statut, 'retard');

  a = O.analyserCopro({ ...base, dateAGComptes: '2026-06-10', dateMajRegistre: '2026-07-01' }, AUJ);
  assert.equal(trouver(a, 'registre', 'annuelle').statut, 'ok');

  a = O.analyserCopro({ ...base, dateAGComptes: '2026-11-05' }, AUJ);
  assert.equal(trouver(a, 'registre', 'annuelle').statut, 'urgent');

  a = O.analyserCopro({ ...base, immatriculation: '' }, AUJ);
  assert.ok(a.echeances.some((e) => e.libelle.includes('Immatriculation')));
});

test('PPPT : calendrier selon le nombre de lots et l\'âge', () => {
  const g = O.analyserCopro({ nom: 'G', lotsPrincipaux: 250, dateReception: '1970-01-01' }, AUJ);
  assert.equal(trouver(g, 'pppt').date, '2023-01-01');
  assert.equal(trouver(g, 'pppt').statut, 'retard');

  const m = O.analyserCopro({ nom: 'M', lotsPrincipaux: 80, dateReception: '1970-01-01' }, AUJ);
  assert.equal(trouver(m, 'pppt').date, '2024-01-01');

  const p = O.analyserCopro({ nom: 'P', lotsPrincipaux: 12, dateReception: '1970-01-01' }, AUJ);
  assert.equal(trouver(p, 'pppt').date, '2025-01-01');

  // Immeuble qui atteint 15 ans après le calendrier
  const r = O.analyserCopro({ nom: 'R', lotsPrincipaux: 40, dateReception: '2015-06-30' }, AUJ);
  assert.equal(trouver(r, 'pppt').date, '2030-06-30');
  assert.equal(trouver(r, 'pppt').statut, 'a_venir');

  // PPPT réalisé non présenté en AG
  const f = O.analyserCopro({ nom: 'F', lotsPrincipaux: 40, dateReception: '1970-01-01', ppptDate: '2026-09-01', dateProchaineAG: '2027-04-15' }, AUJ);
  assert.ok(trouver(f, 'pppt', 'Présentation'));
  assert.equal(trouver(f, 'pppt', 'Actualisation').date, '2036-09-01');
  assert.ok(f.ordreDuJour.some((o) => o.type === 'pppt'));

  // Dispense par DTG sans travaux
  const d = O.analyserCopro({ nom: 'D', lotsPrincipaux: 40, dateReception: '1970-01-01', dtgDate: '2022-05-01', dtgAucunTravaux: true }, AUJ);
  assert.equal(trouver(d, 'pppt').statut, 'ok');
  assert.equal(trouver(d, 'fonds').statut, 'ok');
});

test('DTG : question à l\'AG et fin de validité', () => {
  const a = O.analyserCopro({ nom: 'A', lotsPrincipaux: 20, dateReception: '2000-01-01', dateProchaineAG: '2027-03-01' }, AUJ);
  assert.equal(trouver(a, 'dtg').date, '2027-03-01');
  assert.ok(a.ordreDuJour.some((o) => o.type === 'dtg'));

  const b = O.analyserCopro({ nom: 'B', lotsPrincipaux: 20, dateReception: '2000-01-01', dtgDate: '2017-01-10' }, AUJ);
  assert.equal(trouver(b, 'dtg').date, '2027-01-10');
  assert.equal(trouver(b, 'dtg').statut, 'urgent');

  const c = O.analyserCopro({ nom: 'C', lotsPrincipaux: 20, dateReception: '2020-01-01' }, AUJ);
  assert.equal(trouver(c, 'dtg').statut, 'na');
});

test('fonds de travaux : cotisation minimale', () => {
  const m = O.cotisationMinimale({ budgetPrevisionnel: 100000, pptAdopte: 'oui', montantTravauxPPT: 600000 });
  assert.equal(m.parBudget, 5000);
  assert.equal(m.parPPT, 15000);
  assert.equal(m.minimum, 15000);

  const a = O.analyserCopro({ nom: 'A', lotsPrincipaux: 20, dateReception: '1990-01-01', budgetPrevisionnel: 100000, cotisationFonds: 4000 }, AUJ);
  assert.equal(trouver(a, 'fonds').statut, 'urgent');
  const b = O.analyserCopro({ nom: 'B', lotsPrincipaux: 20, dateReception: '1990-01-01', budgetPrevisionnel: 100000, cotisationFonds: 5000 }, AUJ);
  assert.equal(trouver(b, 'fonds').statut, 'ok');
  const c = O.analyserCopro({ nom: 'C', lotsPrincipaux: 6, dateReception: '1990-01-01', dispenseFondsUnanime: true }, AUJ);
  assert.match(trouver(c, 'fonds').detail, /unanimité/);
  const n = O.analyserCopro({ nom: 'N', lotsPrincipaux: 20, dateReception: '2020-01-01' }, AUJ);
  assert.equal(trouver(n, 'fonds').statut, 'na');
});

test('DPE collectif', () => {
  const a = O.analyserCopro({ nom: 'A', lotsPrincipaux: 30, dateReception: '1980-01-01' }, AUJ);
  assert.equal(trouver(a, 'dpe').date, '2026-01-01');
  const b = O.analyserCopro({ nom: 'B', lotsPrincipaux: 30, dateReception: '2015-01-01', datePermis: '2013-06-01' }, AUJ);
  assert.equal(trouver(b, 'dpe'), undefined);
});

test('export iCalendar', () => {
  const lignes = O.echeancier([{ id: 'x', nom: 'Les Tilleuls', lotsPrincipaux: 30, dateReception: '1980-01-01', dateAGComptes: '2026-11-05' }], AUJ);
  const ics = O.genererIcs(lignes);
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270105/);
  assert.match(ics, /TRIGGER:-P30D/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  assert.match(ics.replace(/\r\n /g, ''), /DESCRIPTION:Données financières/);
});

test('import tableur', () => {
  const r = O.importerLignes([
    { 'Copropriété': 'Le Parc', 'Nombre total de lots': '45', 'Date de réception / construction': '1978', "Dernière AG d'approbation des comptes": '12/05/2026', 'PPT adopté (oui/non)': 'Oui', 'Colonne inconnue': 'x' },
    { 'Copropriété': '' },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].lotsTotal, 45);
  assert.equal(r[0].dateReception, '1978-01-01');
  assert.equal(r[0].dateAGComptes, '2026-05-12');
  assert.equal(r[0].pptAdopte, 'oui');
  assert.equal(r[0].habitation, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/extraction.js');

test('montants au format français', () => {
  assert.equal(X.parseMontant('12 345,67 €'), 12345.67);
  assert.equal(X.parseMontant('12.345,67'), 12345.67);
  assert.equal(X.parseMontant('12345.67'), 12345.67);
  assert.equal(X.parseMontant('1 234,5'), 1234.5);
  assert.deepEqual(X.montantsDansLigne('TVA 10 % 1 250,00 €').map((m) => m.valeur), [1250]);
  assert.deepEqual(X.montantsDansLigne('Le 12/11/2026').map((m) => m.valeur), []);
});

test('devis simple avec totaux en fin de document', () => {
  const r = X.analyserDevis(`
Façades Martin SARL
12 rue des Lilas 69003 Lyon
SIRET 732 829 320 00074
Syndicat des copropriétaires Résidence Les Tilleuls
DEVIS N° D2026-118
Date : 03/11/2026
Désignation   Qté   P.U. HT   Total HT
Échafaudage   1   4 500,00   4 500,00
Ravalement façade   320 m²   45,00   14 400,00
Sous-total HT   18 900,00
Total HT   18 900,00 €
TVA 10 %   1 890,00 €
Total TTC   20 790,00 €
Délai d'exécution : 6 semaines
Devis valable 3 mois
Acompte de 30 % à la commande
Assurance décennale souscrite auprès de SMABTP
Qualibat RGE
`);
  assert.equal(r.prestataire, 'Façades Martin SARL');
  assert.equal(r.siret, '73282932000074');
  assert.equal(r.numero, 'D2026-118');
  assert.equal(r.date, '2026-11-03');
  assert.equal(r.montantHT, 18900);
  assert.equal(r.montantTVA, 1890);
  assert.equal(r.montantTTC, 20790);
  assert.equal(r.tauxTVA, 10);
  assert.equal(r.confiance, 'haute');
  assert.equal(r.delaiJours, 42);
  assert.equal(r.validiteDate, '2027-02-01');
  assert.equal(r.acomptePct, 30);
  assert.equal(r.decennale, 'oui');
  assert.equal(r.assureur, 'SMABTP');
  assert.deepEqual(r.certifications, ['Qualibat', 'RGE']);
});

test('totaux en colonnes (libellés puis valeurs sur la ligne suivante)', () => {
  const r = X.analyserDevis([
    'ENTREPRISE TOITURES DU NORD SAS',
    'Devis n° 4512 du 15 octobre 2026',
    'Total HT   TVA 20%   Total TTC',
    '10 000,00   2 000,00   12 000,00',
  ]);
  assert.equal(r.montantHT, 10000);
  assert.equal(r.montantTVA, 2000);
  assert.equal(r.montantTTC, 12000);
  assert.equal(r.date, '2026-10-15');
});

test('remise : le total net est retenu, pas le brut', () => {
  const r = X.analyserDevis([
    'Ascenseurs Durand SAS',
    'Total HT brut 10 000,00',
    'Remise 5 % HT 500,00',
    'Total HT net 9 500,00',
    'TVA 10 % 950,00',
    'Net à payer TTC 10 450,00',
  ]);
  assert.equal(r.montantHT, 9500);
  assert.equal(r.montantTTC, 10450);
  assert.equal(r.confiance, 'haute');
});

test('pas de TVA explicite : déduction via le taux', () => {
  const r = X.analyserDevis(['Plomberie Rapide EURL', 'Montant HT : 2 000,00 €', 'Montant TTC : 2 200,00 €']);
  assert.equal(r.montantTVA, 200);
  assert.equal(r.tauxTVA, 10);
  assert.equal(r.confiance, 'moyenne');
});

test('numéro de TVA intracommunautaire ignoré', () => {
  const r = X.analyserDevis([
    'Elec Pro SAS - N° TVA intracommunautaire FR12345678901',
    'Total H.T. 1 000,00',
    'T.V.A. 20 % 200,00',
    'Total T.T.C. 1 200,00',
  ]);
  assert.equal(r.montantHT, 1000);
  assert.equal(r.montantTVA, 200);
  assert.equal(r.montantTTC, 1200);
});

test('validation SIRET (Luhn)', () => {
  assert.equal(X.siretValide('732 829 320 00074'), true);
  assert.equal(X.siretValide('73282932000075'), false);
  assert.equal(X.siretValide('123'), false);
});

test('reconstruction des lignes depuis des fragments positionnés', () => {
  const lignes = X.reconstruireLignes([
    { str: '1 890,00 €', x: 400, y: 100, w: 50, h: 10 },
    { str: 'TVA 10 %', x: 50, y: 100.5, w: 40, h: 10 },
    { str: 'Total HT', x: 50, y: 120, w: 40, h: 10 },
    { str: '18 900,00 €', x: 400, y: 120, w: 55, h: 10 },
  ]);
  assert.deepEqual(lignes, ['Total HT   18 900,00 €', 'TVA 10 %   1 890,00 €']);
});

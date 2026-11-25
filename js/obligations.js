/*
 * Obligations réglementaires des copropriétés : calcul des échéances.
 * Fonctions pures, utilisables dans le navigateur (window.Obligations)
 * et sous Node (module.exports) pour les tests.
 *
 * Toutes les dates sont des chaînes ISO « AAAA-MM-JJ ».
 * Les règles sont paramétrables (REGLES) : vérifiez-les avec le syndic,
 * la réglementation évolue.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Obligations = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGLES = {
    registre: {
      delaiMois: 2, // mise à jour annuelle dans les 2 mois suivant l'AG ayant approuvé les comptes
      reference: 'CCH art. L.711-1 s. et décret n° 2016-1167 du 26 août 2016 — registre-coproprietes.gouv.fr',
    },
    pppt: {
      ageMinAns: 15,
      periodiciteAns: 10,
      calendrier: [ // lots à usage de logements, bureaux ou commerces
        { plusDe: 200, date: '2023-01-01' },
        { plusDe: 50, date: '2024-01-01' },
        { plusDe: 0, date: '2025-01-01' },
      ],
      reference: 'Loi du 10 juillet 1965, art. 14-2 (loi Climat et résilience n° 2021-1104, art. 171)',
    },
    dtg: {
      ageMinAns: 10,
      validiteAns: 10,
      reference: 'CCH art. L.731-1 à L.731-5',
    },
    dpe: {
      permisAvant: '2013-01-01',
      validiteAns: 10,
      calendrier: [
        { plusDe: 200, date: '2024-01-01' },
        { plusDe: 50, date: '2025-01-01' },
        { plusDe: 0, date: '2026-01-01' },
      ],
      reference: 'CCH art. L.126-31',
    },
    fondsTravaux: {
      ageMinAns: 10,
      tauxBudget: 5, // % du budget prévisionnel
      tauxPPT: 2.5, // % du montant des travaux du PPT adopté
      lotsDispense: 10, // dispense possible par décision unanime si moins de 10 lots
      reference: 'Loi du 10 juillet 1965, art. 14-2-1 (et 14-2)',
    },
    joursUrgent: 60,
  };

  const TYPES = {
    registre: 'Registre des copropriétés',
    pppt: 'PPPT',
    dtg: 'DTG',
    dpe: 'DPE collectif',
    fonds: 'Fonds de travaux',
    ag: 'Assemblée générale',
  };

  const STATUTS = {
    retard: 'En retard',
    urgent: 'À traiter',
    a_venir: 'À venir',
    ok: 'À jour',
    info: 'À vérifier',
    na: 'Non concerné',
  };
  const ORDRE_STATUT = { retard: 0, urgent: 1, info: 2, a_venir: 3, ok: 4, na: 5 };

  /* ---------------- Dates ---------------- */

  function estDate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
  }

  function versIso(d) {
    return d.toISOString().slice(0, 10);
  }

  function ajouterMois(iso, mois) {
    if (!estDate(iso)) return null;
    const [a, m, j] = iso.split('-').map(Number);
    const total = a * 12 + (m - 1) + mois;
    const na = Math.floor(total / 12);
    const nm = total % 12;
    const dernier = new Date(Date.UTC(na, nm + 1, 0)).getUTCDate();
    return versIso(new Date(Date.UTC(na, nm, Math.min(j, dernier))));
  }

  const ajouterAns = (iso, ans) => ajouterMois(iso, ans * 12);

  function joursEntre(de, a) {
    return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86400000);
  }

  const maxDate = (...ds) => ds.filter(estDate).sort().pop() || null;

  /** Convertit les saisies usuelles (date Excel, JJ/MM/AAAA, année seule, objet Date) en ISO. */
  function normaliserDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return versIso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
    }
    if (typeof v === 'number') {
      if (v >= 1800 && v <= 2200) return `${v}-01-01`; // année seule
      if (v > 0 && v < 100000) return versIso(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)); // numéro de série Excel
      return '';
    }
    const s = String(v).trim();
    if (estDate(s)) return s;
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
      const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return estDate(iso) ? iso : '';
    }
    m = s.match(/^(\d{4})$/);
    if (m) return `${m[1]}-01-01`;
    return '';
  }

  function nombre(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[\s  €%]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = Number(s);
    return s === '' || Number.isNaN(n) ? null : n;
  }

  function oui(v) {
    if (v === true) return true;
    return /^(oui|o|yes|y|x|vrai|true|1)$/i.test(String(v == null ? '' : v).trim());
  }

  /* ---------------- Modèle ---------------- */

  function nouvelleCopro(valeurs) {
    return {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      nom: '', adresse: '', immatriculation: '', gestionnaire: '',
      lotsTotal: null, lotsPrincipaux: null, habitation: true,
      dateReception: '', datePermis: '',
      // AG et registre
      dateAGComptes: '', dateProchaineAG: '', dateMajRegistre: '',
      // Données financières de l'exercice approuvé (fiche registre)
      exerciceClos: '', chargesCourantes: null, chargesExceptionnelles: null,
      dettesFournisseurs: null, impayes: null, debiteurs300: null, salaries: '',
      // PPPT
      ppptDate: '', ppptPresenteAG: '', pptAdopte: '', montantTravauxPPT: null,
      // DTG
      dtgDate: '', dtgAucunTravaux: false, dtgQuestionAG: '',
      // DPE collectif
      dpeDate: '',
      // Fonds de travaux
      budgetPrevisionnel: null, cotisationFonds: null, soldeFonds: null, dispenseFondsUnanime: false,
      notes: '',
      ...valeurs,
    };
  }

  /* ---------------- Calculs ---------------- */

  function ageAns(c, ref) {
    if (!estDate(c.dateReception)) return null;
    let n = Number(ref.slice(0, 4)) - Number(c.dateReception.slice(0, 4));
    if (ref.slice(5) < c.dateReception.slice(5)) n -= 1;
    return n;
  }

  function lotsPourSeuil(c) {
    if (c.lotsPrincipaux != null) return { n: c.lotsPrincipaux, estime: false };
    if (c.lotsTotal != null) return { n: c.lotsTotal, estime: true };
    return { n: null, estime: true };
  }

  function dateCalendrier(calendrier, lots) {
    if (lots == null) return null;
    return (calendrier.find((e) => lots > e.plusDe) || calendrier[calendrier.length - 1]).date;
  }

  function statutPourDate(date, aujourdhui, regles) {
    if (!estDate(date)) return 'info';
    const j = joursEntre(aujourdhui, date);
    if (j < 0) return 'retard';
    if (j <= regles.joursUrgent) return 'urgent';
    return 'a_venir';
  }

  function dtgValide(c, aujourdhui, R) {
    return estDate(c.dtgDate) && ajouterAns(c.dtgDate, R.dtg.validiteAns) > aujourdhui;
  }

  /** Cotisation annuelle minimale au fonds de travaux. */
  function cotisationMinimale(c, regles) {
    const R = regles || REGLES;
    const parBudget = c.budgetPrevisionnel != null ? (c.budgetPrevisionnel * R.fondsTravaux.tauxBudget) / 100 : null;
    const parPPT = oui(c.pptAdopte) && c.montantTravauxPPT != null ? (c.montantTravauxPPT * R.fondsTravaux.tauxPPT) / 100 : null;
    if (parBudget == null && parPPT == null) return { minimum: null, parBudget, parPPT };
    return { minimum: Math.round(Math.max(parBudget || 0, parPPT || 0) * 100) / 100, parBudget, parPPT };
  }

  /**
   * Calcule les obligations d'une copropriété.
   * Retourne { echeances: [...], ordreDuJour: [...], alertes: [...] }.
   * Échéance : { type, libelle, date, statut, detail, reference, action }
   */
  function analyserCopro(copro, aujourdhui, regles) {
    const R = regles || REGLES;
    const c = nouvelleCopro(copro);
    const auj = aujourdhui;
    const age = ageAns(c, auj);
    const lots = lotsPourSeuil(c);
    const ech = [];
    const odj = [];
    const alertes = [];
    const ajout = (e) => ech.push({ reference: '', detail: '', action: '', date: null, ...e });
    const prochaineAG = estDate(c.dateProchaineAG) && c.dateProchaineAG >= auj ? c.dateProchaineAG : null;

    if (!estDate(c.dateReception)) alertes.push("Date de réception des travaux / construction non renseignée : les obligations liées à l'âge de l'immeuble ne peuvent pas être calculées.");
    if (lots.n == null) alertes.push('Nombre de lots non renseigné : le calendrier PPPT / DPE ne peut pas être déterminé.');
    else if (lots.estime) alertes.push('Nombre de lots principaux (logements, bureaux, commerces) non renseigné : le nombre total de lots est utilisé pour les seuils PPPT / DPE.');

    /* ---- Registre des copropriétés ---- */
    if (!c.immatriculation) {
      ajout({ type: 'registre', libelle: "Immatriculation au registre", statut: 'info', detail: "Aucun numéro d'immatriculation saisi. Toute copropriété à usage d'habitation doit être immatriculée.", reference: R.registre.reference, action: "Vérifier l'immatriculation sur registre-coproprietes.gouv.fr et reporter le numéro." });
    }
    if (estDate(c.dateAGComptes)) {
      const limite = ajouterMois(c.dateAGComptes, R.registre.delaiMois);
      const fait = estDate(c.dateMajRegistre) && c.dateMajRegistre >= c.dateAGComptes;
      ajout({
        type: 'registre',
        libelle: 'Mise à jour annuelle du registre',
        date: limite,
        statut: fait ? 'ok' : statutPourDate(limite, auj, R),
        detail: fait
          ? `Mise à jour effectuée le ${fr(c.dateMajRegistre)} (AG du ${fr(c.dateAGComptes)}).`
          : `Données financières de l'exercice approuvé à l'AG du ${fr(c.dateAGComptes)} à télédéclarer au plus tard le ${fr(limite)}.`,
        reference: R.registre.reference,
        action: fait ? '' : 'Saisir la mise à jour annuelle (fiche registre ci-dessous), puis renseigner la date de mise à jour.',
      });
    } else {
      ajout({ type: 'registre', libelle: 'Mise à jour annuelle du registre', statut: 'info', detail: "Date de la dernière AG d'approbation des comptes non renseignée.", reference: R.registre.reference });
    }
    if (prochaineAG) {
      ajout({ type: 'registre', libelle: 'Prochaine mise à jour du registre', date: ajouterMois(prochaineAG, R.registre.delaiMois), statut: 'a_venir', detail: `À réaliser dans les ${R.registre.delaiMois} mois suivant l'AG du ${fr(prochaineAG)}.`, reference: R.registre.reference });
    }

    /* ---- PPPT ---- */
    const dispensePPPTparDTG = c.dtgAucunTravaux && dtgValide(c, auj, R);
    if (!c.habitation) {
      ajout({ type: 'pppt', libelle: 'Projet de plan pluriannuel de travaux', statut: 'na', detail: "Immeuble non affecté (même partiellement) à l'habitation.", reference: R.pppt.reference });
    } else if (estDate(c.dateReception)) {
      const dateLegale = dateCalendrier(R.pppt.calendrier, lots.n);
      const date15 = ajouterAns(c.dateReception, R.pppt.ageMinAns);
      const exigible = maxDate(dateLegale, date15);
      if (estDate(c.ppptDate)) {
        const renouvellement = ajouterAns(c.ppptDate, R.pppt.periodiciteAns);
        ajout({ type: 'pppt', libelle: 'Actualisation du PPPT (tous les 10 ans)', date: renouvellement, statut: statutPourDate(renouvellement, auj, R) === 'a_venir' ? 'ok' : statutPourDate(renouvellement, auj, R), detail: `PPPT réalisé le ${fr(c.ppptDate)}.`, reference: R.pppt.reference });
        if (!estDate(c.ppptPresenteAG) || c.ppptPresenteAG < c.ppptDate) {
          ajout({ type: 'pppt', libelle: 'Présentation du PPPT en AG', date: prochaineAG, statut: prochaineAG ? statutPourDate(prochaineAG, auj, R) : 'urgent', detail: "Le PPPT doit être présenté à la première AG qui suit son élaboration ; l'AG se prononce sur l'adoption de tout ou partie du plan.", reference: R.pppt.reference, action: 'Inscrire la présentation du PPPT et le vote du PPT à la prochaine AG.' });
          odj.push({ type: 'pppt', texte: `Présentation du projet de plan pluriannuel de travaux réalisé le ${fr(c.ppptDate)} et décision sur l'adoption de tout ou partie du plan pluriannuel de travaux (art. 14-2).` });
        } else if (!c.pptAdopte) {
          alertes.push("PPPT présenté en AG : préciser si le plan pluriannuel de travaux a été adopté (et son montant, qui sert au calcul du fonds de travaux).");
        }
      } else if (dispensePPPTparDTG) {
        ajout({ type: 'pppt', libelle: 'PPPT — dispense (DTG)', date: ajouterAns(c.dtgDate, R.dtg.validiteAns), statut: 'ok', detail: `Dispense tant que le DTG du ${fr(c.dtgDate)}, sans besoin de travaux dans les 10 ans, est valide. Le PPPT redevient exigible à son échéance.`, reference: R.pppt.reference });
      } else if (exigible) {
        const statut = statutPourDate(exigible, auj, R);
        ajout({
          type: 'pppt',
          libelle: 'Élaboration du PPPT',
          date: exigible,
          statut,
          detail: `Obligatoire pour cette copropriété (${lots.n} lots${lots.estime ? ' au total' : ''}, immeuble de plus de ${R.pppt.ageMinAns} ans) à compter du ${fr(exigible)}.`,
          reference: R.pppt.reference,
          action: "Faire voter en AG la réalisation du PPPT (ou d'un DTG valant PPPT) et la désignation du prestataire.",
        });
        if (statut !== 'a_venir' || (prochaineAG && exigible <= ajouterAns(prochaineAG, 1))) {
          odj.push({ type: 'pppt', texte: "Décision à prendre sur la réalisation d'un projet de plan pluriannuel de travaux (PPPT) : choix du prestataire, montant des honoraires et modalités de financement (art. 14-2)." });
        }
      } else {
        ajout({ type: 'pppt', libelle: 'Élaboration du PPPT', statut: 'info', detail: 'Nombre de lots inconnu : date d’exigibilité non calculable.', reference: R.pppt.reference });
      }
    }

    /* ---- DTG ---- */
    if (estDate(c.dtgDate)) {
      const fin = ajouterAns(c.dtgDate, R.dtg.validiteAns);
      const s = statutPourDate(fin, auj, R);
      ajout({ type: 'dtg', libelle: 'Fin de validité du DTG', date: fin, statut: s === 'a_venir' ? 'ok' : s, detail: `DTG réalisé le ${fr(c.dtgDate)}${c.dtgAucunTravaux ? ' (aucun besoin de travaux identifié sur 10 ans : dispense PPPT et fonds de travaux pendant sa validité)' : ''}.`, reference: R.dtg.reference, action: s === 'a_venir' ? '' : "Inscrire à l'AG la question de la réalisation d'un nouveau DTG." });
      if (s !== 'a_venir') odj.push({ type: 'dtg', texte: `Décision sur la réalisation d'un nouveau diagnostic technique global, le précédent (${fr(c.dtgDate)}) arrivant à échéance le ${fr(fin)} (art. L.731-1 CCH).` });
    } else if (age != null && age >= R.dtg.ageMinAns) {
      const vote = estDate(c.dtgQuestionAG);
      ajout({
        type: 'dtg',
        libelle: "Question du DTG soumise à l'AG",
        date: vote ? null : prochaineAG,
        statut: vote ? 'ok' : (prochaineAG ? statutPourDate(prochaineAG, auj, R) : 'urgent'),
        detail: vote
          ? `Question soumise à l'AG du ${fr(c.dtgQuestionAG)}. Pensez à la reposer si un PPPT est à réaliser : un DTG peut en tenir lieu.`
          : "L'AG doit se prononcer sur la réalisation d'un diagnostic technique global (immeuble de plus de 10 ans).",
        reference: R.dtg.reference,
        action: vote ? '' : "Inscrire la question du DTG à l'ordre du jour.",
      });
      if (!vote) odj.push({ type: 'dtg', texte: "Décision à prendre sur la réalisation d'un diagnostic technique global (DTG) de l'immeuble (art. L.731-1 CCH)." });
    } else if (age != null) {
      ajout({ type: 'dtg', libelle: 'DTG', statut: 'na', detail: `Immeuble de ${age} ans (moins de ${R.dtg.ageMinAns} ans).`, reference: R.dtg.reference });
    }

    /* ---- DPE collectif ---- */
    const permis = estDate(c.datePermis) ? c.datePermis : (estDate(c.dateReception) ? c.dateReception : null);
    if (permis && permis < R.dpe.permisAvant && c.habitation) {
      if (estDate(c.dpeDate)) {
        const fin = ajouterAns(c.dpeDate, R.dpe.validiteAns);
        const s = statutPourDate(fin, auj, R);
        ajout({ type: 'dpe', libelle: 'Renouvellement du DPE collectif', date: fin, statut: s === 'a_venir' ? 'ok' : s, detail: `DPE collectif réalisé le ${fr(c.dpeDate)}.`, reference: R.dpe.reference });
      } else {
        const d = dateCalendrier(R.dpe.calendrier, lots.n);
        ajout({ type: 'dpe', libelle: 'Réalisation du DPE collectif', date: d, statut: d ? statutPourDate(d, auj, R) : 'info', detail: `Immeuble dont le permis de construire est antérieur au 01/01/2013${estDate(c.datePermis) ? '' : ' (date estimée d’après la construction)'}.`, reference: R.dpe.reference, action: 'Faire voter la réalisation du DPE collectif (souvent commandé avec le PPPT).' });
        if (d && d <= (prochaineAG || auj)) odj.push({ type: 'dpe', texte: "Décision à prendre sur la réalisation du diagnostic de performance énergétique (DPE) collectif (art. L.126-31 CCH)." });
      }
    }

    /* ---- Fonds de travaux ---- */
    if (age != null && age < R.fondsTravaux.ageMinAns) {
      ajout({ type: 'fonds', libelle: 'Fonds de travaux', date: ajouterAns(c.dateReception, R.fondsTravaux.ageMinAns), statut: 'na', detail: `Obligatoire à l'issue des ${R.fondsTravaux.ageMinAns} ans suivant la réception de l'immeuble.`, reference: R.fondsTravaux.reference });
    } else if (c.dispenseFondsUnanime && (lots.n != null && lots.n < R.fondsTravaux.lotsDispense)) {
      ajout({ type: 'fonds', libelle: 'Fonds de travaux', statut: 'ok', detail: `Dispense votée à l'unanimité (moins de ${R.fondsTravaux.lotsDispense} lots).`, reference: R.fondsTravaux.reference });
    } else if (c.dtgAucunTravaux && dtgValide(c, auj, R)) {
      ajout({ type: 'fonds', libelle: 'Fonds de travaux — dispense (DTG)', date: ajouterAns(c.dtgDate, R.dtg.validiteAns), statut: 'ok', detail: 'Dispense pendant la validité du DTG ne faisant apparaître aucun besoin de travaux sur 10 ans.', reference: R.fondsTravaux.reference });
    } else if (age != null) {
      const { minimum, parBudget, parPPT } = cotisationMinimale(c, R);
      const calcul = [
        parBudget != null ? `${R.fondsTravaux.tauxBudget} % du budget prévisionnel = ${eur(parBudget)}` : null,
        parPPT != null ? `${R.fondsTravaux.tauxPPT} % des travaux du PPT adopté = ${eur(parPPT)}` : null,
      ].filter(Boolean).join(' ; ');
      let statut;
      let detail;
      if (minimum == null) {
        statut = 'info';
        detail = 'Renseigner le budget prévisionnel (et le montant du PPT adopté) pour calculer la cotisation minimale.';
      } else if (c.cotisationFonds == null) {
        statut = 'info';
        detail = `Cotisation minimale : ${eur(minimum)} (${calcul}). Cotisation votée non renseignée.`;
      } else if (c.cotisationFonds + 0.005 < minimum) {
        statut = prochaineAG ? statutPourDate(prochaineAG, auj, R) : 'urgent';
        if (statut === 'a_venir') statut = 'urgent';
        detail = `Cotisation votée ${eur(c.cotisationFonds)} inférieure au minimum légal de ${eur(minimum)} (${calcul}).`;
      } else {
        statut = 'ok';
        detail = `Cotisation votée ${eur(c.cotisationFonds)} ≥ minimum de ${eur(minimum)} (${calcul}).`;
      }
      ajout({ type: 'fonds', libelle: 'Cotisation annuelle au fonds de travaux', date: prochaineAG, statut, detail, reference: R.fondsTravaux.reference, action: statut === 'ok' ? '' : 'Proposer à la prochaine AG une cotisation au moins égale au minimum.' });
      odj.push({ type: 'fonds', texte: `Fixation du montant de la cotisation annuelle au fonds de travaux${minimum != null ? ` (minimum légal : ${eur(minimum)})` : ''} (art. 14-2-1).` });
    }

    /* ---- Prochaine AG ---- */
    if (prochaineAG) {
      ajout({ type: 'ag', libelle: 'Prochaine AG', date: prochaineAG, statut: statutPourDate(prochaineAG, auj, R) === 'urgent' ? 'urgent' : 'a_venir', detail: odj.length ? `${odj.length} point(s) réglementaire(s) à inscrire à l'ordre du jour.` : '', action: odj.length ? "Vérifier l'ordre du jour avant l'envoi des convocations (21 jours avant l'AG)." : '' });
    } else if (estDate(c.dateAGComptes)) {
      const estimee = ajouterAns(c.dateAGComptes, 1);
      if (estimee < auj) alertes.push(`Dernière AG d'approbation des comptes il y a plus d'un an (${fr(c.dateAGComptes)}) : renseigner la date de la prochaine AG.`);
    }

    ech.sort(trierEcheances);
    return { echeances: ech, ordreDuJour: odj, alertes, age, lots };
  }

  function trierEcheances(a, b) {
    return (ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut]) || String(a.date || '9999').localeCompare(String(b.date || '9999'));
  }

  /** Toutes les échéances du portefeuille, triées par date. */
  function echeancier(copros, aujourdhui, regles) {
    const lignes = [];
    for (const c of copros) {
      const a = analyserCopro(c, aujourdhui, regles);
      for (const e of a.echeances) lignes.push({ ...e, coproId: c.id, copro: c.nom || 'Sans nom' });
    }
    return lignes.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || (ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut]));
  }

  /* ---------------- Fiche registre ---------------- */

  function ficheRegistre(copro) {
    const c = nouvelleCopro(copro);
    const l = [
      `MISE À JOUR ANNUELLE — REGISTRE NATIONAL DES COPROPRIÉTÉS`,
      `Copropriété : ${c.nom || '—'}${c.adresse ? ' — ' + c.adresse : ''}`,
      `N° d'immatriculation : ${c.immatriculation || 'à compléter'}`,
      `AG ayant approuvé les comptes : ${fr(c.dateAGComptes)} — à télédéclarer avant le ${fr(ajouterMois(c.dateAGComptes, REGLES.registre.delaiMois))}`,
      '',
      'Données financières (exercice approuvé)',
      `  Date de clôture de l'exercice : ${fr(c.exerciceClos)}`,
      `  Charges pour opérations courantes : ${eur(c.chargesCourantes)}`,
      `  Charges pour travaux et opérations exceptionnelles : ${eur(c.chargesExceptionnelles)}`,
      `  Dettes fournisseurs (à la clôture) : ${eur(c.dettesFournisseurs)}`,
      `  Sommes restant dues par les copropriétaires (impayés) : ${eur(c.impayes)}`,
      `  Nombre de copropriétaires débiteurs de plus de 300 € : ${c.debiteurs300 == null ? '—' : c.debiteurs300}`,
      `  Montant du fonds de travaux : ${eur(c.soldeFonds)}`,
      `  Présence de personnel salarié : ${c.salaries || '—'}`,
      '',
      'Données techniques / structure',
      `  Nombre total de lots : ${c.lotsTotal == null ? '—' : c.lotsTotal} — lots principaux (logements, bureaux, commerces) : ${c.lotsPrincipaux == null ? '—' : c.lotsPrincipaux}`,
      `  Période de construction / réception : ${fr(c.dateReception)}`,
      `  DTG : ${estDate(c.dtgDate) ? fr(c.dtgDate) : 'non réalisé'} — PPPT : ${estDate(c.ppptDate) ? fr(c.ppptDate) : 'non réalisé'} — DPE collectif : ${estDate(c.dpeDate) ? fr(c.dpeDate) : 'non réalisé'}`,
      '',
      'À vérifier avant télédéclaration : changement de syndic, procédures en cours (mandataire ad hoc, administration provisoire, arrêtés), évolution du nombre de lots.',
    ];
    return l.join('\n');
  }

  /* ---------------- Calendrier iCalendar (.ics) ---------------- */

  function echapperIcs(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  /** Plie les lignes à 75 octets UTF-8 (RFC 5545), sans couper un caractère. */
  function plierIcs(ligne) {
    const out = [];
    let courant = '';
    let octets = 0;
    for (const ch of ligne) {
      const n = unescape(encodeURIComponent(ch)).length;
      const max = out.length ? 74 : 75; // la ligne de continuation commence par une espace
      if (octets + n > max) { out.push(courant); courant = ''; octets = 0; }
      courant += ch;
      octets += n;
    }
    out.push(courant);
    return out.join('\r\n ');
  }

  /** Génère un fichier .ics (Outlook, Google Agenda…) avec rappels. */
  function genererIcs(lignes, options) {
    const o = { rappelJours: 30, horodatage: '20260101T000000Z', ...(options || {}) };
    const evts = lignes.filter((e) => estDate(e.date) && e.statut !== 'ok' && e.statut !== 'na');
    const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Copropriete//Obligations reglementaires//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of evts) {
      const d = e.date.replace(/-/g, '');
      const lendemain = versIso(new Date(Date.parse(e.date + 'T00:00:00Z') + 86400000)).replace(/-/g, '');
      const uid = `${e.coproId || 'copro'}-${e.type}-${d}-${(e.libelle || '').replace(/[^a-z0-9]/gi, '').slice(0, 20)}@obligations-copro`;
      out.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${o.horodatage}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${lendemain}`,
        plierIcs(`SUMMARY:${echapperIcs(`${e.statut === 'retard' ? 'EN RETARD - ' : ''}[${e.copro || ''}] ${e.libelle}`)}`),
        plierIcs(`DESCRIPTION:${echapperIcs([e.detail, e.action, e.reference].filter(Boolean).join('\n'))}`),
        `CATEGORIES:${echapperIcs(TYPES[e.type] || e.type)}`);
      if (o.rappelJours > 0) out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-P${o.rappelJours}D`, plierIcs(`DESCRIPTION:${echapperIcs(`Échéance dans ${o.rappelJours} jours : ${e.libelle}`)}`), 'END:VALARM');
      out.push('END:VEVENT');
    }
    out.push('END:VCALENDAR');
    return out.join('\r\n') + '\r\n';
  }

  /* ---------------- Import tableur ---------------- */

  const COLONNES = [
    ['nom', 'Copropriété', 'texte'],
    ['adresse', 'Adresse', 'texte'],
    ['immatriculation', "N° d'immatriculation", 'texte'],
    ['gestionnaire', 'Gestionnaire', 'texte'],
    ['lotsTotal', 'Nombre total de lots', 'nombre'],
    ['lotsPrincipaux', 'Lots principaux (logements, bureaux, commerces)', 'nombre'],
    ['habitation', "Usage d'habitation (oui/non)", 'booleen'],
    ['dateReception', 'Date de réception / construction', 'date'],
    ['datePermis', 'Date du permis de construire', 'date'],
    ['dateAGComptes', "Dernière AG d'approbation des comptes", 'date'],
    ['dateProchaineAG', 'Prochaine AG', 'date'],
    ['dateMajRegistre', 'Dernière mise à jour du registre', 'date'],
    ['exerciceClos', "Clôture de l'exercice approuvé", 'date'],
    ['chargesCourantes', 'Charges courantes (€)', 'nombre'],
    ['chargesExceptionnelles', 'Charges travaux / exceptionnelles (€)', 'nombre'],
    ['dettesFournisseurs', 'Dettes fournisseurs (€)', 'nombre'],
    ['impayes', 'Impayés copropriétaires (€)', 'nombre'],
    ['debiteurs300', 'Débiteurs > 300 €', 'nombre'],
    ['salaries', 'Personnel salarié (oui/non)', 'texte'],
    ['budgetPrevisionnel', 'Budget prévisionnel (€)', 'nombre'],
    ['cotisationFonds', 'Cotisation fonds de travaux votée (€/an)', 'nombre'],
    ['soldeFonds', 'Solde du fonds de travaux (€)', 'nombre'],
    ['dispenseFondsUnanime', 'Dispense fonds travaux votée à l’unanimité (oui/non)', 'booleen'],
    ['ppptDate', 'Date du PPPT', 'date'],
    ['ppptPresenteAG', 'PPPT présenté en AG le', 'date'],
    ['pptAdopte', 'PPT adopté (oui/non)', 'texte'],
    ['montantTravauxPPT', 'Montant des travaux du PPT adopté (€)', 'nombre'],
    ['dtgDate', 'Date du DTG', 'date'],
    ['dtgAucunTravaux', 'DTG sans besoin de travaux à 10 ans (oui/non)', 'booleen'],
    ['dtgQuestionAG', 'Question du DTG soumise en AG le', 'date'],
    ['dpeDate', 'Date du DPE collectif', 'date'],
    ['notes', 'Notes', 'texte'],
  ];

  const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** lignes : tableau d'objets { entête: valeur } (ex. XLSX.utils.sheet_to_json). */
  function importerLignes(lignes) {
    const index = new Map(COLONNES.map(([cle, libelle]) => [sansAccent(libelle), cle]));
    for (const [cle] of COLONNES) index.set(sansAccent(cle), cle);
    const types = Object.fromEntries(COLONNES.map(([cle, , t]) => [cle, t]));
    const res = [];
    for (const l of lignes) {
      const v = {};
      for (const [entete, val] of Object.entries(l)) {
        const cle = index.get(sansAccent(entete));
        if (!cle) continue;
        const t = types[cle];
        if (t === 'date') v[cle] = normaliserDate(val);
        else if (t === 'nombre') v[cle] = nombre(val);
        else if (t === 'booleen') v[cle] = String(val).trim() === '' ? (cle === 'habitation' ? true : false) : oui(val);
        else if (cle === 'pptAdopte') v[cle] = String(val).trim() === '' ? '' : (oui(val) ? 'oui' : 'non');
        else v[cle] = val == null ? '' : String(val).trim();
      }
      if (v.nom) res.push(nouvelleCopro(v));
    }
    return res;
  }

  /* ---------------- Formatage ---------------- */

  function fr(iso) {
    return estDate(iso) ? iso.split('-').reverse().join('/') : '—';
  }

  function eur(v) {
    if (v == null) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v).replace(/\u202f/g, ' ');
  }

  return {
    REGLES, TYPES, STATUTS, COLONNES,
    estDate, ajouterMois, ajouterAns, joursEntre, normaliserDate, nombre, oui,
    nouvelleCopro, ageAns, cotisationMinimale, analyserCopro, echeancier,
    ficheRegistre, genererIcs, importerLignes, fr, eur,
  };
});

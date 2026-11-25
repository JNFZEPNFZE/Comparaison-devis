/* Comparaison de devis — interface (navigateur uniquement). */
(function () {
  'use strict';

  const X = window.Extraction;
  const CLE_STOCKAGE = 'comparaison-devis:v1';

  const CRITERES = [
    { cle: 'prix', libelle: 'Prix', defaut: 50 },
    { cle: 'technique', libelle: 'Qualité technique', defaut: 20 },
    { cle: 'delai', libelle: 'Délai', defaut: 10 },
    { cle: 'garanties', libelle: 'Garanties / assurances', defaut: 10 },
    { cle: 'references', libelle: 'Références', defaut: 10 },
  ];
  const CHAMPS_NUM = new Set(['montantHT', 'tauxTVA', 'montantTVA', 'montantTTC', 'delaiJours', 'acomptePct', 'noteTechnique', 'noteReferences']);
  const MAJORITES = { 24: "l'article 24", 25: "l'article 25", 26: "l'article 26" };

  /* ---------------- État ---------------- */

  function etatVide() {
    return {
      dossier: { copro: '', adresse: '', syndic: '', objet: '', dateAG: '', budget: null, majorite: '24', cle: '', tantiemes: null, honorairesPct: null, dommagesOuvrage: null },
      poids: Object.fromEntries(CRITERES.map((c) => [c.cle, c.defaut])),
      devis: [],
      retenu: '',
      avisCS: '',
      note: '',
      noteModifiee: false,
    };
  }

  function nouveauDevis(valeurs) {
    return {
      id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      fichier: '', prestataire: '', montantHT: null, tauxTVA: null, montantTVA: null, montantTTC: null,
      numero: '', date: '', validiteDate: '', delaiJours: null, siret: '', acomptePct: null,
      decennale: 'a_verifier', assureur: '', visite: '', noteTechnique: 3, noteReferences: 3,
      certifications: '', observations: '', confiance: 'manuelle', texte: '',
      ...valeurs,
    };
  }

  let etat = charger() || etatVide();

  function charger() {
    try {
      const brut = localStorage.getItem(CLE_STOCKAGE);
      if (!brut) return null;
      return normaliserEtat(JSON.parse(brut));
    } catch (e) {
      return null;
    }
  }

  function normaliserEtat(e) {
    const base = etatVide();
    return {
      ...base, ...e,
      dossier: { ...base.dossier, ...(e.dossier || {}) },
      poids: { ...base.poids, ...(e.poids || {}) },
      devis: (e.devis || []).map((d) => nouveauDevis(d)),
    };
  }

  let minuterie = null;
  function sauver() {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      try {
        const copie = { ...etat, devis: etat.devis.map((d) => ({ ...d, texte: (d.texte || '').slice(0, 30000) })) };
        localStorage.setItem(CLE_STOCKAGE, JSON.stringify(copie));
      } catch (e) { /* stockage indisponible : sans conséquence */ }
    }, 300);
  }

  /* ---------------- Utilitaires ---------------- */

  const $ = (sel, racine = document) => racine.querySelector(sel);
  const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nb = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const fmtEur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const eur = (v) => (v == null ? '—' : fmtEur0.format(v));
  const pct = (v, d = 1) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: d })} %`);
  const num = (v, d = 1) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: d }));
  const dateFr = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
  const nomDe = (d, i) => d.prestataire || `Devis ${i + 1}`;
  const arr2 = (v) => Math.round(v * 100) / 100;

  function delaiTexte(j) {
    if (j == null) return '—';
    if (j % 30 === 0 && j >= 30) return `${j / 30} mois`;
    if (j % 7 === 0 && j >= 7) return `${j / 7} semaine${j > 7 ? 's' : ''}`;
    return `${j} jour${j > 1 ? 's' : ''}`;
  }

  /* ---------------- Calculs ---------------- */

  function ttcEffectif(d) {
    if (d.montantTTC != null) return d.montantTTC;
    if (d.montantHT != null && d.tauxTVA != null) return Math.round(d.montantHT * (1 + d.tauxTVA / 100) * 100) / 100;
    if (d.montantHT != null && d.montantTVA != null) return d.montantHT + d.montantTVA;
    return null;
  }
  function htEffectif(d) {
    if (d.montantHT != null) return d.montantHT;
    if (d.montantTTC != null && d.tauxTVA != null) return Math.round((d.montantTTC / (1 + d.tauxTVA / 100)) * 100) / 100;
    return null;
  }

  function calculer() {
    const D = etat.dossier;
    const dateAG = D.dateAG || null;
    const liste = etat.devis.map((d, i) => {
      const ttc = ttcEffectif(d);
      const ht = htEffectif(d);
      const honoraires = D.honorairesPct && ht != null ? Math.round(ht * D.honorairesPct) / 100 : null;
      const total = ttc == null ? null : arr2(ttc + (honoraires || 0) + (D.dommagesOuvrage || 0));
      return { d, i, nom: nomDe(d, i), ttc, ht, honoraires, total, alertes: [] };
    });

    const avecPrix = liste.filter((c) => c.ttc != null && c.ttc > 0);
    const minTTC = avecPrix.length ? Math.min(...avecPrix.map((c) => c.ttc)) : null;
    const maxTTC = avecPrix.length ? Math.max(...avecPrix.map((c) => c.ttc)) : null;
    const avecDelai = liste.filter((c) => c.d.delaiJours > 0);
    const minDelai = avecDelai.length ? Math.min(...avecDelai.map((c) => c.d.delaiJours)) : null;
    const sommePoids = CRITERES.reduce((s, c) => s + (Number(etat.poids[c.cle]) || 0), 0);

    for (const c of liste) {
      const d = c.d;
      c.ecart = c.ttc != null && minTTC != null ? arr2(c.ttc - minTTC) : null;
      c.ecartPct = c.ecart != null && minTTC ? (c.ecart / minTTC) * 100 : null;
      c.ecartBudget = c.ttc != null && D.budget ? arr2(c.ttc - D.budget) : null;
      c.pour1000 = c.total != null && D.tantiemes ? arr2((c.total / D.tantiemes) * 1000) : null;

      c.notes = {
        prix: c.ttc > 0 && minTTC ? (5 * minTTC) / c.ttc : 0,
        technique: clamp(d.noteTechnique),
        delai: d.delaiJours > 0 && minDelai ? (5 * minDelai) / d.delaiJours : 0,
        garanties: d.decennale === 'oui' ? 5 : d.decennale === 'a_verifier' ? 2.5 : 0,
        references: clamp(d.noteReferences),
      };
      c.score = sommePoids > 0
        ? (CRITERES.reduce((s, k) => s + (Number(etat.poids[k.cle]) || 0) * c.notes[k.cle], 0) / sommePoids) * 4
        : null;

      // Points d'attention
      const A = (niveau, texte) => c.alertes.push({ niveau, texte });
      if (c.ttc == null) A('erreur', 'Montant TTC manquant');
      if (d.montantHT != null && d.montantTVA != null && d.montantTTC != null &&
          Math.abs(d.montantHT + d.montantTVA - d.montantTTC) > Math.max(0.06, d.montantTTC * 0.0005)) {
        A('erreur', 'HT + TVA ≠ TTC : montants à contrôler');
      }
      if (d.confiance === 'faible' || d.confiance === 'aucune') A('attention', 'Montants lus automatiquement avec une fiabilité faible : à vérifier sur le PDF');
      if (d.tauxTVA != null && ![20, 10, 5.5, 2.1, 0].includes(Number(d.tauxTVA))) A('attention', `Taux de TVA inhabituel (${pct(d.tauxTVA)})`);
      if (Number(d.tauxTVA) === 20) A('info', 'TVA à 20 % : un taux réduit (10 %, ou 5,5 % pour la rénovation énergétique) peut s’appliquer aux logements de plus de 2 ans');
      if (d.validiteDate && dateAG && d.validiteDate < dateAG) A('attention', `Devis expiré le ${dateFr(d.validiteDate)}, avant l’AG : demander une prolongation`);
      if (!d.validiteDate) A('info', 'Durée de validité non précisée');
      if (d.decennale === 'non') A('erreur', 'Pas d’attestation d’assurance décennale');
      else if (d.decennale === 'a_verifier') A('attention', 'Attestation d’assurance décennale à demander');
      if (!d.siret) A('info', 'SIRET non renseigné');
      else if (!X.siretValide(d.siret)) A('attention', 'Numéro SIRET invalide');
      if (d.acomptePct > 30) A('attention', `Acompte élevé (${pct(d.acomptePct)})`);
      if (!d.delaiJours) A('info', 'Délai d’exécution non précisé (note délai = 0)');
      if (d.visite === 'non') A('info', 'Devis établi sans visite des lieux');
      if (avecPrix.length >= 3 && c.ttc) {
        const autres = avecPrix.filter((o) => o !== c);
        const moy = autres.reduce((s, o) => s + o.ttc, 0) / autres.length;
        if (c.ttc < moy * 0.75) A('attention', 'Prix nettement inférieur aux autres offres : vérifier que toutes les prestations sont incluses');
        if (c.ttc > moy * 1.3) A('info', 'Prix nettement supérieur aux autres offres');
      }
    }

    const classes = [...liste].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.ttc ?? Infinity) - (b.ttc ?? Infinity));
    classes.forEach((c, k) => (c.rang = k + 1));

    const retenu = liste.find((c) => c.d.id === etat.retenu) || classes[0] || null;
    const globales = [];
    if (liste.length === 1) globales.push('Un seul devis : ajoutez des offres concurrentes pour pouvoir comparer.');
    if (liste.length > 0 && liste.length < 3) globales.push('Il est d’usage de présenter au moins trois devis. La mise en concurrence est obligatoire au-delà du montant fixé par l’assemblée générale (art. 21 de la loi du 10 juillet 1965).');
    if (sommePoids <= 0) globales.push('La somme des pondérations est nulle : aucune note globale ne peut être calculée.');
    if (D.budget && minTTC && minTTC > D.budget) globales.push(`L’offre la moins chère dépasse le budget prévisionnel de ${eur(minTTC - D.budget)}.`);
    const expires = liste.filter((c) => c.d.validiteDate && dateAG && c.d.validiteDate < dateAG);
    if (expires.length) globales.push(`${expires.length} devis ser${expires.length > 1 ? 'ont' : 'a'} expiré${expires.length > 1 ? 's' : ''} à la date de l’AG.`);

    return { liste, classes, retenu, minTTC, maxTTC, minDelai, sommePoids, globales };
  }

  function clamp(v) {
    const n = nb(v);
    return n == null ? 0 : Math.max(0, Math.min(5, n));
  }

  /* ---------------- Modèle du tableau (HTML + Excel) ---------------- */

  function modeleTableau(calc) {
    const D = etat.dossier;
    const cols = calc.classes; // colonnes triées par classement
    const lignes = [];
    const groupe = (titre) => lignes.push({ groupe: titre });
    const ligne = (libelle, f, opts = {}) => {
      const cellules = cols.map((c) => {
        const r = f(c);
        return typeof r === 'object' && r !== null && 'v' in r ? r : { v: r };
      });
      if (opts.meilleur) {
        const vals = cellules.map((x) => x.n).filter((n) => n != null);
        if (vals.length > 1 && new Set(vals).size > 1) {
          const best = opts.meilleur === 'min' ? Math.min(...vals) : Math.max(...vals);
          cellules.forEach((x) => { if (x.n === best) x.classe = 'meilleur'; });
        }
      }
      lignes.push({ libelle, cellules, texte: opts.texte });
    };

    groupe('Identification');
    ligne('N° et date du devis', (c) => [c.d.numero, c.d.date ? `du ${dateFr(c.d.date)}` : ''].filter(Boolean).join(' ') || '—', { texte: true });
    ligne('SIRET', (c) => ({ v: c.d.siret || '—', classe: c.d.siret && !X.siretValide(c.d.siret) ? 'alerte' : '' }), { texte: true });
    ligne('Certifications', (c) => c.d.certifications || '—', { texte: true });

    groupe('Prix');
    ligne('Montant HT', (c) => ({ v: eur(c.ht), n: c.ht, fmt: 'eur' }));
    ligne('TVA', (c) => ({ v: c.d.montantTVA != null || c.d.tauxTVA != null ? `${eur(c.d.montantTVA ?? (c.ttc != null && c.ht != null ? c.ttc - c.ht : null))} (${pct(c.d.tauxTVA)})` : '—', n: c.d.montantTVA, fmt: 'eur', texteSeul: true }));
    ligne('Montant TTC', (c) => ({ v: eur(c.ttc), n: c.ttc, fmt: 'eur', classe: c.ttc == null ? 'alerte' : '' }), { meilleur: 'min' });
    ligne('Écart avec le moins-disant', (c) => ({ v: c.ecart == null ? '—' : c.ecart === 0 ? 'Moins-disant' : `+${eur(c.ecart)} (+${pct(c.ecartPct)})`, n: c.ecart, fmt: 'eur', texteSeul: true }));
    if (D.budget) ligne('Écart avec le budget', (c) => ({ v: c.ecartBudget == null ? '—' : `${c.ecartBudget > 0 ? '+' : ''}${eur(c.ecartBudget)}`, n: c.ecartBudget, fmt: 'eur', classe: c.ecartBudget > 0 ? 'alerte' : '' }));
    if (D.honorairesPct) ligne(`Honoraires syndic (${pct(D.honorairesPct, 2)} du HT)`, (c) => ({ v: eur(c.honoraires), n: c.honoraires, fmt: 'eur' }));
    if (D.dommagesOuvrage) ligne('Assurance dommages-ouvrage', () => ({ v: eur(D.dommagesOuvrage), n: D.dommagesOuvrage, fmt: 'eur' }));
    if (D.honorairesPct || D.dommagesOuvrage) ligne('Coût total de l’opération', (c) => ({ v: eur(c.total), n: c.total, fmt: 'eur' }), { meilleur: 'min' });
    if (D.tantiemes) ligne('Pour 1 000 tantièmes', (c) => ({ v: eur(c.pour1000), n: c.pour1000, fmt: 'eur' }), { meilleur: 'min' });

    groupe('Conditions');
    ligne('Délai d’exécution', (c) => ({ v: delaiTexte(c.d.delaiJours), n: c.d.delaiJours || null }), { meilleur: 'min' });
    ligne('Validité de l’offre', (c) => ({ v: c.d.validiteDate ? `jusqu’au ${dateFr(c.d.validiteDate)}` : '—', classe: c.d.validiteDate && D.dateAG && c.d.validiteDate < D.dateAG ? 'alerte' : '' }), { texte: true });
    ligne('Acompte', (c) => ({ v: pct(c.d.acomptePct), n: c.d.acomptePct, classe: c.d.acomptePct > 30 ? 'alerte' : '' }));
    ligne('Assurance décennale', (c) => ({
      v: c.d.decennale === 'oui' ? `Oui${c.d.assureur ? ` (${c.d.assureur})` : ''}` : c.d.decennale === 'non' ? 'Non fournie' : 'À vérifier',
      classe: c.d.decennale === 'oui' ? '' : 'alerte',
    }), { texte: true });
    ligne('Visite des lieux', (c) => (c.d.visite === 'oui' ? 'Oui' : c.d.visite === 'non' ? 'Non' : '—'), { texte: true });
    ligne('Observations', (c) => c.d.observations || '—', { texte: true });

    groupe(`Évaluation (pondération : ${CRITERES.map((k) => `${k.libelle.toLowerCase()} ${Math.round(((Number(etat.poids[k.cle]) || 0) / (calc.sommePoids || 1)) * 100)} %`).join(', ')})`);
    for (const k of CRITERES) {
      ligne(`Note ${k.libelle.toLowerCase()} /5`, (c) => ({ v: num(c.notes[k.cle]), n: Math.round(c.notes[k.cle] * 10) / 10, fmt: 'num' }), { meilleur: 'max' });
    }
    ligne('Note globale /20', (c) => ({ v: c.score == null ? '—' : num(c.score), n: c.score == null ? null : Math.round(c.score * 10) / 10, fmt: 'num' }), { meilleur: 'max' });
    ligne('Classement', (c) => ({ v: `${c.rang}${c.rang === 1 ? 'er' : 'e'}`, n: c.rang, fmt: 'num' }));
    lignes[lignes.length - 2].score = true;
    lignes[lignes.length - 1].rang = true;

    groupe('Points d’attention');
    ligne('À vérifier', (c) => ({
      v: c.alertes.filter((a) => a.niveau !== 'info').map((a) => a.texte).join(' ; ') || 'RAS',
      liste: c.alertes.filter((a) => a.niveau !== 'info').map((a) => a.texte),
    }), { texte: true });

    return { cols, lignes };
  }

  /* ---------------- Rendu ---------------- */

  function rendreDossier() {
    for (const el of $$('[data-d]')) {
      const v = etat.dossier[el.dataset.d];
      el.value = v == null ? '' : v;
    }
    $('#avis-cs').value = etat.avisCS || '';
  }

  function rendrePoids() {
    const cont = $('#champs-poids');
    cont.innerHTML = CRITERES.map((k) => `<label>${esc(k.libelle)}<input type="number" min="0" step="5" data-poids="${k.cle}" value="${esc(etat.poids[k.cle])}"></label>`).join('') +
      '<div class="total" id="total-poids"></div>';
    majTotalPoids();
  }
  function majTotalPoids() {
    const s = CRITERES.reduce((a, k) => a + (Number(etat.poids[k.cle]) || 0), 0);
    $('#total-poids').textContent = `Total : ${s}${s === 100 ? ' %' : ' (normalisé à 100 %)'}`;
  }

  function rendreListeDevis() {
    const cont = $('#liste-devis');
    cont.innerHTML = '';
    if (!etat.devis.length) {
      cont.innerHTML = '<p class="vide">Aucun devis pour l’instant.</p>';
      return;
    }
    const tpl = $('#tpl-devis');
    etat.devis.forEach((d) => {
      const n = tpl.content.firstElementChild.cloneNode(true);
      n.dataset.id = d.id;
      for (const el of $$('[data-f]', n)) {
        const v = d[el.dataset.f];
        el.value = v == null ? '' : v;
      }
      const src = $('.texte-source', n);
      if (d.texte) $('pre', src).textContent = d.texte;
      else src.remove();
      cont.appendChild(n);
    });
    majBadges();
  }

  function majBadges() {
    const calc = calculer();
    for (const c of calc.liste) {
      const carte = $(`.devis[data-id="${c.d.id}"]`);
      if (!carte) continue;
      const b = [];
      if (c.d.fichier) b.push(`<span class="badge" title="Fichier importé">📄 ${esc(c.d.fichier)}</span>`);
      const conf = { haute: ['ok', 'Montants vérifiés (HT + TVA = TTC)'], moyenne: ['attention', 'Montants déduits : à vérifier'], faible: ['erreur', 'Lecture incertaine : à vérifier'], aucune: ['erreur', 'Montants non trouvés'] }[c.d.confiance];
      if (conf) b.push(`<span class="badge ${conf[0]}">${conf[1]}</span>`);
      if (c.score != null && calc.liste.length > 1) b.push(`<span class="badge">${num(c.score)}/20 · ${c.rang}${c.rang === 1 ? 'er' : 'e'}</span>`);
      for (const a of c.alertes.filter((x) => x.niveau === 'erreur')) b.push(`<span class="badge erreur">${esc(a.texte)}</span>`);
      $('.badges', carte).innerHTML = b.join('');
    }
  }

  function rendreComparatif() {
    const calc = calculer();
    const tab = $('#tableau-comparatif');
    $('#alertes-globales').innerHTML = calc.globales.map((g) => `<div class="alerte-globale">${esc(g)}</div>`).join('');

    if (!calc.liste.length) {
      tab.innerHTML = '<tbody><tr><td class="vide">Ajoutez des devis pour afficher le comparatif.</td></tr></tbody>';
    } else {
      const { cols, lignes } = modeleTableau(calc);
      const idRetenu = calc.retenu && calc.retenu.d.id;
      let h = '<thead><tr><th scope="col">Critère</th>';
      h += cols.map((c) => `<th scope="col" class="${c.d.id === idRetenu ? 'retenu-col' : ''}">${esc(c.nom)}${c.d.id === idRetenu ? '<br><small>★ proposé</small>' : ''}</th>`).join('');
      h += '</tr></thead><tbody>';
      for (const l of lignes) {
        if (l.groupe) {
          h += `<tr class="groupe"><th colspan="${cols.length + 1}">${esc(l.groupe)}</th></tr>`;
          continue;
        }
        h += `<tr class="${l.score ? 'score' : ''}${l.rang ? 'rang' : ''}"><th scope="row">${esc(l.libelle)}</th>`;
        h += l.cellules.map((x) => {
          const cls = [x.classe, l.texte ? 'texte' : ''].filter(Boolean).join(' ');
          const contenu = x.liste ? (x.liste.length ? `<ul>${x.liste.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : 'RAS') : esc(x.v);
          return `<td class="${cls}">${contenu}</td>`;
        }).join('');
        h += '</tr>';
      }
      tab.innerHTML = h + '</tbody>';
    }

    // Sélecteur de l'entreprise proposée
    const sel = $('#select-retenu');
    const meilleur = calc.classes[0];
    sel.innerHTML = `<option value="">Automatique${meilleur ? ` (${esc(meilleur.nom)})` : ''}</option>` +
      calc.liste.map((c) => `<option value="${c.d.id}">${esc(c.nom)}</option>`).join('');
    sel.value = calc.liste.some((c) => c.d.id === etat.retenu) ? etat.retenu : '';

    // En-tête d'impression
    const D = etat.dossier;
    $('#entete-impression').innerHTML = `<h1>Tableau comparatif des devis — ${esc(D.objet || 'travaux')}</h1>
      <p>${esc([D.copro, D.adresse].filter(Boolean).join(' – '))}${D.dateAG ? ` · Assemblée générale du ${dateFr(D.dateAG)}` : ''}${D.syndic ? ` · Syndic : ${esc(D.syndic)}` : ''}${D.budget ? ` · Budget prévisionnel : ${eur(D.budget)} TTC` : ''}</p>`;

    // Note
    if (!etat.noteModifiee) {
      etat.note = genererNote(calc);
      $('#texte-note').value = etat.note;
    }
    $('#info-note').textContent = etat.noteModifiee
      ? 'Texte modifié à la main : il n’est plus mis à jour automatiquement. « Régénérer le texte » repart des données actuelles.'
      : 'Le texte se met à jour automatiquement ; vous pouvez le modifier librement avant impression.';
    $('#note-impression').textContent = etat.note;
    majBadges();
  }

  /* ---------------- Note de recommandation ---------------- */

  function genererNote(calc) {
    const D = etat.dossier;
    const objet = D.objet || 'les travaux';
    const r = calc.retenu;
    const L = [];
    L.push(`NOTE DU CONSEIL SYNDICAL — ${objet.toUpperCase()}`);
    if (D.copro || D.adresse) L.push([D.copro, D.adresse].filter(Boolean).join(', '));
    if (D.dateAG) L.push(`Assemblée générale du ${dateFr(D.dateAG)}`);
    L.push('');

    L.push('1. Objet de la consultation');
    const n = calc.liste.length;
    L.push(`${n} entreprise${n > 1 ? 's ont' : ' a'} remis une offre pour : ${objet}.` +
      (D.budget ? ` Le budget prévisionnel était estimé à ${eur(D.budget)} TTC.` : ''));
    L.push('');

    L.push('2. Offres reçues (par ordre de prix)');
    const parPrix = [...calc.liste].sort((a, b) => (a.ttc ?? Infinity) - (b.ttc ?? Infinity));
    for (const c of parPrix) {
      const d = c.d;
      const elts = [`${eur(c.ht)} HT, soit ${eur(c.ttc)} TTC${d.tauxTVA != null ? ` (TVA ${pct(d.tauxTVA)})` : ''}`];
      if (d.delaiJours) elts.push(`délai ${delaiTexte(d.delaiJours)}`);
      if (d.validiteDate) elts.push(`offre valable jusqu’au ${dateFr(d.validiteDate)}`);
      elts.push(d.decennale === 'oui' ? 'assurance décennale fournie' : d.decennale === 'non' ? 'sans attestation décennale' : 'attestation décennale à obtenir');
      L.push(`- ${c.nom}${d.numero ? ` (devis n° ${d.numero}${d.date ? ` du ${dateFr(d.date)}` : ''})` : ''} : ${elts.join(' ; ')}.`);
    }
    L.push('');

    if (n >= 1) {
      L.push('3. Analyse');
      if (n > 1 && calc.minTTC != null && calc.maxTTC != null) {
        const moins = parPrix[0];
        L.push(`L’offre la moins chère est celle de ${moins.nom} (${eur(moins.ttc)} TTC). L’écart entre l’offre la moins chère et la plus chère est de ${eur(calc.maxTTC - calc.minTTC)} (${pct(((calc.maxTTC - calc.minTTC) / calc.minTTC) * 100)}).`);
      }
      if (calc.sommePoids > 0) {
        L.push(`Chaque offre a été notée selon les critères suivants : ${CRITERES.map((k) => `${k.libelle.toLowerCase()} (${Math.round(((Number(etat.poids[k.cle]) || 0) / calc.sommePoids) * 100)} %)`).join(', ')}.`);
        L.push('Classement :');
        for (const c of calc.classes) L.push(`  ${c.rang}. ${c.nom} — ${num(c.score)}/20`);
      }
      L.push('');
    }

    if (r) {
      L.push('4. Recommandation');
      const raisons = [];
      if (r.rang === 1 && n > 1) raisons.push('meilleure note globale');
      if (r.ttc != null && r.ttc === calc.minTTC && n > 1) raisons.push('offre la moins chère');
      if (r.d.delaiJours && r.d.delaiJours === calc.minDelai && n > 1) raisons.push('délai le plus court');
      L.push(`Le conseil syndical propose de retenir l’offre de ${r.nom} pour un montant de ${eur(r.ht)} HT, soit ${eur(r.ttc)} TTC${raisons.length ? ` (${raisons.join(', ')})` : ''}.`);
      if (r.rang > 1) L.push(`Cette offre n’est pas la mieux notée selon la grille ci-dessus ; le choix du conseil syndical est motivé par l’avis ci-dessous.`);
      if (etat.avisCS && etat.avisCS.trim()) L.push(etat.avisCS.trim());
      const pts = r.alertes.filter((a) => a.niveau !== 'info');
      if (pts.length) {
        L.push('Points à régler avant signature :');
        for (const a of pts) L.push(`- ${a.texte}`);
      }
      L.push('');

      L.push('PROJET DE RÉSOLUTION');
      L.push(`Résolution n° … : ${objet} — choix de l’entreprise et financement (majorité de ${MAJORITES[D.majorite] || "l'article 24"} de la loi du 10 juillet 1965)`);
      L.push('');
      L.push(`L’assemblée générale, après avoir pris connaissance des conditions essentielles des devis notifiés, de l’avis du conseil syndical, et après en avoir délibéré :`);
      L.push(`- décide de faire réaliser les travaux suivants : ${objet} ;`);
      L.push(`- retient la proposition de l’entreprise ${r.nom}${r.d.numero ? ` (devis n° ${r.d.numero}${r.d.date ? ` du ${dateFr(r.d.date)}` : ''})` : ''} pour un montant de ${eur(r.ht)} HT, soit ${eur(r.ttc)} TTC ;`);
      if (D.honorairesPct) L.push(`- fixe les honoraires du syndic pour le suivi administratif et financier des travaux à ${pct(D.honorairesPct, 2)} du montant HT des travaux, soit ${eur(r.honoraires)} ;`);
      if (D.dommagesOuvrage) L.push(`- décide de souscrire une assurance dommages-ouvrage pour un montant estimé à ${eur(D.dommagesOuvrage)} TTC ;`);
      L.push(`- précise que le coût des travaux${D.honorairesPct || D.dommagesOuvrage ? `, honoraires et frais annexes inclus (${eur(r.total)} TTC),` : ''} sera réparti selon ${D.cle ? `la clé « ${D.cle} »` : 'la clé de répartition applicable'} ;`);
      L.push('- autorise le syndic à procéder aux appels de fonds selon l’échéancier suivant : … ;');
      L.push('- donne mandat au syndic pour signer le devis et suivre l’exécution des travaux.');
    }
    return L.join('\n');
  }

  /* ---------------- Import PDF ---------------- */

  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

  async function lirePdf(fichier) {
    const donnees = new Uint8Array(await fichier.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data: donnees, isEvalSupported: false }).promise;
    const lignes = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const contenu = await page.getTextContent();
      const items = contenu.items
        .filter((it) => 'str' in it)
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) }));
      lignes.push(...X.reconstruireLignes(items));
    }
    return lignes;
  }

  async function importerFichiers(fichiers) {
    const pdfs = [...fichiers].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) return;
    const etatImport = $('#etat-import');
    let ok = 0;
    const erreurs = [];
    for (const [k, f] of pdfs.entries()) {
      etatImport.textContent = `Lecture de ${f.name} (${k + 1}/${pdfs.length})…`;
      try {
        const lignes = await lirePdf(f);
        const texte = lignes.join('\n');
        if (texte.replace(/\s/g, '').length < 30) {
          etat.devis.push(nouveauDevis({ fichier: f.name, prestataire: f.name.replace(/\.pdf$/i, ''), confiance: 'aucune', observations: 'PDF sans texte (scanné ?) : saisir les montants à la main.' }));
        } else {
          const r = X.analyserDevis(lignes);
          etat.devis.push(nouveauDevis({
            fichier: f.name,
            prestataire: r.prestataire || f.name.replace(/\.pdf$/i, ''),
            montantHT: r.montantHT, tauxTVA: r.tauxTVA, montantTVA: r.montantTVA, montantTTC: r.montantTTC,
            numero: r.numero || '', date: r.date || '', validiteDate: r.validiteDate || '',
            delaiJours: r.delaiJours, siret: r.siret || '', acomptePct: r.acomptePct,
            decennale: r.decennale, assureur: r.assureur || '', certifications: r.certifications.join(', '),
            confiance: r.confiance, texte,
          }));
        }
        ok++;
      } catch (e) {
        console.error(e);
        erreurs.push(f.name);
      }
    }
    etatImport.textContent = `${ok} devis importé${ok > 1 ? 's' : ''}${erreurs.length ? ` — échec : ${erreurs.join(', ')}` : ''}. Vérifiez les champs avant de présenter le comparatif.`;
    sauver();
    rendreListeDevis();
    rendreComparatif();
  }

  /* ---------------- Exports ---------------- */

  function imprimer(mode) {
    rendreComparatif();
    document.body.classList.remove('impression-tableau', 'impression-note');
    document.body.classList.add(`impression-${mode}`);
    let style = $('#style-page');
    if (!style) {
      style = document.createElement('style');
      style.id = 'style-page';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: A4 ${mode === 'tableau' ? 'landscape' : 'portrait'}; margin: 12mm; }`;
    const ancienTitre = document.title;
    document.title = `${mode === 'tableau' ? 'Comparatif devis' : 'Note CS'} - ${etat.dossier.objet || 'travaux'}`.replace(/[\\/:*?"<>|]/g, '');
    window.print();
    document.title = ancienTitre;
  }

  function exporterExcel() {
    if (!window.XLSX) return alert('Module Excel indisponible.');
    const calc = calculer();
    const D = etat.dossier;
    const wb = XLSX.utils.book_new();
    const fEur = '#,##0.00 "€"';

    // Feuille 1 : comparatif
    const { cols, lignes } = modeleTableau(calc);
    const aoa = [
      [`Tableau comparatif — ${D.objet || 'travaux'}`],
      [[D.copro, D.adresse, D.dateAG ? `AG du ${dateFr(D.dateAG)}` : ''].filter(Boolean).join(' – ')],
      [],
      ['Critère', ...cols.map((c) => c.nom + (calc.retenu && c.d.id === calc.retenu.d.id ? ' (proposé)' : ''))],
    ];
    for (const l of lignes) {
      if (l.groupe) aoa.push([l.groupe.toUpperCase()]);
      else aoa.push([l.libelle, ...l.cellules.map((x) => (x.n == null ? x.v : x.fmt === 'eur' && !x.texteSeul ? { t: 'n', v: x.n, z: fEur } : x.fmt === 'num' ? { t: 'n', v: x.n } : x.v))]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(aoa);
    ws1['!cols'] = [{ wch: 34 }, ...cols.map(() => ({ wch: 28 }))];
    XLSX.utils.book_append_sheet(wb, ws1, 'Comparatif');

    // Feuille 2 : détail des devis
    const entetes = ['Prestataire', 'Fichier', 'N° devis', 'Date', 'Validité', 'SIRET', 'Montant HT', 'Taux TVA (%)', 'TVA', 'Montant TTC', 'Écart moins-disant', 'Honoraires syndic', 'Coût total opération', 'Pour 1000 tantièmes', 'Délai (jours)', 'Acompte (%)', 'Décennale', 'Assureur', 'Visite', 'Certifications', 'Note prix', 'Note technique', 'Note délai', 'Note garanties', 'Note références', 'Note /20', 'Rang', 'Points d’attention', 'Observations'];
    const e = (v) => (v == null ? null : { t: 'n', v, z: fEur });
    const r1 = (v) => (v == null ? null : Math.round(v * 100) / 100);
    const detail = [entetes, ...calc.liste.map((c) => [
      c.nom, c.d.fichier, c.d.numero, dateFr(c.d.date), dateFr(c.d.validiteDate), c.d.siret,
      e(c.ht), c.d.tauxTVA, e(c.d.montantTVA), e(c.ttc), e(c.ecart), e(c.honoraires), e(c.total), e(c.pour1000),
      c.d.delaiJours, c.d.acomptePct, { oui: 'Oui', non: 'Non', a_verifier: 'À vérifier' }[c.d.decennale], c.d.assureur, c.d.visite,
      c.d.certifications, ...CRITERES.map((k) => r1(c.notes[k.cle])), r1(c.score), c.rang,
      c.alertes.map((a) => a.texte).join(' ; '), c.d.observations,
    ])];
    const ws2 = XLSX.utils.aoa_to_sheet(detail);
    ws2['!cols'] = entetes.map((h, i) => ({ wch: i === 0 ? 28 : i >= 27 ? 60 : Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Détail des devis');

    // Feuille 3 : note
    const ws3 = XLSX.utils.aoa_to_sheet((etat.note || genererNote(calc)).split('\n').map((l) => [l]));
    ws3['!cols'] = [{ wch: 140 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Note');

    XLSX.writeFile(wb, `Comparatif devis - ${(D.objet || 'travaux').replace(/[\\/:*?"<>|]/g, '')}.xlsx`);
  }

  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- Exemple ---------------- */

  function exemple() {
    const e = etatVide();
    const annee = new Date().getFullYear();
    const iso = (m, j, a = annee) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
    e.dossier = { ...e.dossier, copro: 'Résidence Les Tilleuls (exemple)', adresse: '12 rue des Lilas, 69003 Lyon', syndic: 'Cabinet Exemple Gestion', objet: 'Ravalement de la façade sur rue', dateAG: iso(3, 18, annee + 1), budget: 60000, majorite: '24', cle: 'Charges communes générales', tantiemes: 10000, honorairesPct: 2.5 };
    e.devis = [
      nouveauDevis({ prestataire: 'Façades Martin SARL', numero: 'D2026-118', date: iso(11, 3), validiteDate: iso(5, 3, annee + 1), montantHT: 52400, tauxTVA: 10, montantTVA: 5240, montantTTC: 57640, delaiJours: 42, siret: '73282932000074', acomptePct: 30, decennale: 'oui', assureur: 'SMABTP', visite: 'oui', noteTechnique: 4, noteReferences: 4, certifications: 'Qualibat', confiance: 'haute', observations: 'Échafaudage et protection des balcons inclus.' }),
      nouveauDevis({ prestataire: 'Rénov’Habitat SAS', numero: '4512', date: iso(10, 15), validiteDate: iso(1, 15, annee + 1), montantHT: 47900, tauxTVA: 10, montantTVA: 4790, montantTTC: 52690, delaiJours: 56, siret: '', acomptePct: 40, decennale: 'a_verifier', visite: 'non', noteTechnique: 2.5, noteReferences: 3, confiance: 'haute', observations: 'Traitement des fissures en option (+3 200 € HT).' }),
      nouveauDevis({ prestataire: 'Bâti Rhône Façades SAS', numero: 'BRF-0921', date: iso(11, 8), validiteDate: iso(6, 8, annee + 1), montantHT: 55800, tauxTVA: 10, montantTVA: 5580, montantTTC: 61380, delaiJours: 35, siret: '', acomptePct: 30, decennale: 'oui', assureur: 'AXA', visite: 'oui', noteTechnique: 4.5, noteReferences: 4, certifications: 'Qualibat, RGE', confiance: 'haute', observations: 'Inclut l’hydrofuge et le traitement des fissures.' }),
    ];
    e.avisCS = 'Le conseil syndical a reçu les trois entreprises. Il recommande une offre comprenant le traitement des fissures et une attestation décennale à jour.';
    return e;
  }

  /* ---------------- Événements ---------------- */

  function rafraichir() {
    sauver();
    rendreComparatif();
  }

  function brancher() {
    // Dossier
    $('#champs-dossier').addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-d]');
      if (!el) return;
      const cle = el.dataset.d;
      etat.dossier[cle] = el.type === 'number' ? nb(el.value) : el.value;
      rafraichir();
    });

    // Pondération
    $('#champs-poids').addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-poids]');
      if (!el) return;
      etat.poids[el.dataset.poids] = nb(el.value) || 0;
      majTotalPoids();
      rafraichir();
    });

    // Devis
    const liste = $('#liste-devis');
    const majChamp = (ev) => {
      const el = ev.target.closest('[data-f]');
      if (!el) return;
      const d = etat.devis.find((x) => x.id === el.closest('.devis').dataset.id);
      if (!d) return;
      const f = el.dataset.f;
      d[f] = CHAMPS_NUM.has(f) ? nb(el.value) : el.value;
      if (['montantHT', 'tauxTVA', 'montantTVA', 'montantTTC'].includes(f) && d.confiance !== 'manuelle') d.confiance = 'manuelle';
      rafraichir();
    };
    liste.addEventListener('input', majChamp);
    liste.addEventListener('change', (ev) => {
      majChamp(ev);
      // Complète les montants manquants quand c'est possible
      const el = ev.target.closest('[data-f]');
      if (!el || !['montantHT', 'tauxTVA', 'montantTVA', 'montantTTC'].includes(el.dataset.f)) return;
      const carte = el.closest('.devis');
      const d = etat.devis.find((x) => x.id === carte.dataset.id);
      const r2 = (v) => Math.round(v * 100) / 100;
      if (d.montantHT != null && d.tauxTVA != null) {
        if (d.montantTVA == null) d.montantTVA = r2((d.montantHT * d.tauxTVA) / 100);
        if (d.montantTTC == null) d.montantTTC = r2(d.montantHT + d.montantTVA);
      } else if (d.montantTTC != null && d.tauxTVA != null && d.montantHT == null) {
        d.montantHT = r2(d.montantTTC / (1 + d.tauxTVA / 100));
        if (d.montantTVA == null) d.montantTVA = r2(d.montantTTC - d.montantHT);
      } else if (d.montantHT != null && d.montantTTC != null && d.montantTVA == null) {
        d.montantTVA = r2(d.montantTTC - d.montantHT);
        if (d.tauxTVA == null && d.montantHT) d.tauxTVA = r2((d.montantTVA / d.montantHT) * 100);
      }
      for (const f of ['montantHT', 'tauxTVA', 'montantTVA', 'montantTTC']) $(`[data-f="${f}"]`, carte).value = d[f] == null ? '' : d[f];
      rafraichir();
    });
    liste.addEventListener('click', (ev) => {
      const b = ev.target.closest('.btn-suppr');
      if (!b) return;
      const id = b.closest('.devis').dataset.id;
      const d = etat.devis.find((x) => x.id === id);
      if (!confirm(`Retirer le devis « ${d.prestataire || 'sans nom'} » ?`)) return;
      etat.devis = etat.devis.filter((x) => x.id !== id);
      if (etat.retenu === id) etat.retenu = '';
      rendreListeDevis();
      rafraichir();
    });

    $('#btn-ajout-manuel').addEventListener('click', () => {
      etat.devis.push(nouveauDevis());
      rendreListeDevis();
      rafraichir();
      const cartes = $$('.devis');
      $('.nom', cartes[cartes.length - 1]).focus();
    });

    // Dépôt de fichiers
    const zone = $('#zone-depot');
    const input = $('#input-pdf');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { importerFichiers(input.files); input.value = ''; });
    zone.addEventListener('dragover', (ev) => { ev.preventDefault(); zone.classList.add('survol'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
    zone.addEventListener('drop', (ev) => { ev.preventDefault(); zone.classList.remove('survol'); importerFichiers(ev.dataTransfer.files); });

    // Note
    $('#select-retenu').addEventListener('change', (ev) => { etat.retenu = ev.target.value; rafraichir(); });
    $('#avis-cs').addEventListener('input', (ev) => { etat.avisCS = ev.target.value; rafraichir(); });
    $('#texte-note').addEventListener('input', (ev) => {
      etat.note = ev.target.value;
      etat.noteModifiee = true;
      $('#note-impression').textContent = etat.note;
      $('#info-note').textContent = 'Texte modifié à la main : il n’est plus mis à jour automatiquement. « Régénérer le texte » repart des données actuelles.';
      sauver();
    });
    $('#btn-regenerer').addEventListener('click', () => {
      if (etat.noteModifiee && !confirm('Remplacer le texte modifié par une version régénérée ?')) return;
      etat.noteModifiee = false;
      rafraichir();
    });
    $('#btn-copier-note').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(etat.note);
        $('#btn-copier-note').textContent = 'Copié ✓';
      } catch (e) {
        $('#texte-note').select();
        document.execCommand('copy');
      }
      setTimeout(() => ($('#btn-copier-note').textContent = 'Copier'), 1500);
    });

    // Exports
    $('#btn-imprimer-tableau').addEventListener('click', () => imprimer('tableau'));
    $('#btn-imprimer-note').addEventListener('click', () => imprimer('note'));
    $('#btn-excel').addEventListener('click', exporterExcel);
    window.addEventListener('afterprint', () => document.body.classList.remove('impression-tableau', 'impression-note'));

    // Dossier : enregistrer / ouvrir / nouveau / exemple
    $('#btn-sauver').addEventListener('click', () => {
      const nom = `Dossier devis - ${(etat.dossier.objet || 'travaux').replace(/[\\/:*?"<>|]/g, '')}.json`;
      telecharger(nom, JSON.stringify(etat, null, 2), 'application/json');
    });
    $('#btn-ouvrir').addEventListener('click', () => $('#input-dossier').click());
    $('#input-dossier').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      try {
        etat = normaliserEtat(JSON.parse(await f.text()));
        toutRendre();
        sauver();
      } catch (e) {
        alert('Ce fichier n’est pas un dossier valide.');
      }
    });
    $('#btn-nouveau').addEventListener('click', () => {
      if (etat.devis.length && !confirm('Commencer un nouveau dossier ? Pensez à enregistrer le dossier actuel si besoin.')) return;
      etat = etatVide();
      toutRendre();
      sauver();
    });
    $('#btn-exemple').addEventListener('click', () => {
      if (etat.devis.length && !confirm('Remplacer le dossier actuel par un exemple ?')) return;
      etat = exemple();
      toutRendre();
      sauver();
    });
  }

  function toutRendre() {
    rendreDossier();
    rendrePoids();
    rendreListeDevis();
    rendreComparatif();
  }

  brancher();
  toutRendre();

  // Accès pour les tests automatisés
  window.ComparaisonDevis = { get etat() { return etat; }, calculer, genererNote };
})();

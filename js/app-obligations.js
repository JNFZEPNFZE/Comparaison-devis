/* Obligations réglementaires — interface (navigateur uniquement). */
(function () {
  'use strict';

  const O = window.Obligations;
  const CLE_STOCKAGE = 'obligations-copro:v1';

  const SECTIONS = [
    { titre: 'Identification', champs: [
      ['nom', 'Copropriété', 'texte', 'Résidence Les Tilleuls'],
      ['adresse', 'Adresse', 'texte', '12 rue des Lilas, 69003 Lyon'],
      ['immatriculation', "N° d'immatriculation", 'texte', 'AA1234567'],
      ['gestionnaire', 'Gestionnaire', 'texte'],
      ['lotsTotal', 'Nombre total de lots', 'nombre'],
      ['lotsPrincipaux', 'Lots principaux (logements, bureaux, commerces)', 'nombre'],
      ['dateReception', 'Date de réception / construction', 'date'],
      ['datePermis', 'Date du permis de construire', 'date'],
      ['habitation', "Immeuble à usage (même partiel) d'habitation", 'case'],
    ] },
    { titre: 'Assemblée générale et registre', champs: [
      ['dateAGComptes', "Dernière AG d'approbation des comptes", 'date'],
      ['dateMajRegistre', 'Dernière mise à jour du registre', 'date'],
      ['dateProchaineAG', 'Prochaine AG', 'date'],
    ] },
    { titre: "Données financières de l'exercice approuvé (pour le registre)", champs: [
      ['exerciceClos', "Clôture de l'exercice", 'date'],
      ['chargesCourantes', 'Charges courantes (€)', 'nombre'],
      ['chargesExceptionnelles', 'Charges travaux / exceptionnelles (€)', 'nombre'],
      ['dettesFournisseurs', 'Dettes fournisseurs (€)', 'nombre'],
      ['impayes', 'Impayés copropriétaires (€)', 'nombre'],
      ['debiteurs300', 'Débiteurs de plus de 300 €', 'nombre'],
      ['salaries', 'Personnel salarié', 'choix', [['', '—'], ['non', 'Non'], ['oui', 'Oui']]],
    ] },
    { titre: 'PPPT — projet de plan pluriannuel de travaux', champs: [
      ['ppptDate', 'PPPT réalisé le', 'date'],
      ['ppptPresenteAG', 'Présenté en AG le', 'date'],
      ['pptAdopte', 'Plan adopté par l’AG', 'choix', [['', '—'], ['oui', 'Oui (tout ou partie)'], ['non', 'Non']]],
      ['montantTravauxPPT', 'Montant des travaux du PPT adopté (€)', 'nombre'],
    ] },
    { titre: 'DTG et DPE collectif', champs: [
      ['dtgDate', 'DTG réalisé le', 'date'],
      ['dtgAucunTravaux', 'Le DTG ne prévoit aucun travaux sur 10 ans', 'case'],
      ['dtgQuestionAG', "Question du DTG soumise à l'AG le", 'date'],
      ['dpeDate', 'DPE collectif réalisé le', 'date'],
    ] },
    { titre: 'Fonds de travaux', champs: [
      ['budgetPrevisionnel', 'Budget prévisionnel annuel (€)', 'nombre'],
      ['cotisationFonds', 'Cotisation annuelle votée (€)', 'nombre'],
      ['soldeFonds', 'Solde du fonds de travaux (€)', 'nombre'],
      ['dispenseFondsUnanime', 'Dispense votée à l’unanimité (moins de 10 lots)', 'case'],
    ] },
    { titre: 'Notes', champs: [['notes', 'Notes internes', 'zone']] },
  ];

  /* ---------------- État ---------------- */

  const etatVide = () => ({ copros: [], selection: '', reglages: { joursUrgent: O.REGLES.joursUrgent, rappelJours: 30 }, filtres: { copro: '', type: '', statut: 'actions' } });

  function normaliser(e) {
    const b = etatVide();
    return { ...b, ...e, reglages: { ...b.reglages, ...(e.reglages || {}) }, filtres: { ...b.filtres, ...(e.filtres || {}) }, copros: (e.copros || []).map((c) => O.nouvelleCopro(c)) };
  }

  let etat = (() => {
    try {
      const brut = localStorage.getItem(CLE_STOCKAGE);
      return brut ? normaliser(JSON.parse(brut)) : etatVide();
    } catch (e) {
      return etatVide();
    }
  })();

  let minuterie = null;
  function sauver() {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat)); } catch (e) { /* stockage indisponible */ }
    }, 300);
  }

  /* ---------------- Utilitaires ---------------- */

  const $ = (sel, racine = document) => racine.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aujourdhui = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const regles = () => ({ ...O.REGLES, joursUrgent: Number(etat.reglages.joursUrgent) >= 0 ? Number(etat.reglages.joursUrgent) : O.REGLES.joursUrgent });
  const coproSel = () => etat.copros.find((c) => c.id === etat.selection) || null;
  const nomFichier = (s) => String(s).replace(/[\\/:*?"<>|]/g, '');
  const badge = (s) => `<span class="statut ${s}">${esc(O.STATUTS[s])}</span>`;

  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(contenu instanceof Blob ? contenu : new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copier(texte, bouton) {
    try {
      await navigator.clipboard.writeText(texte);
      const t = bouton.textContent;
      bouton.textContent = 'Copié ✓';
      setTimeout(() => { bouton.textContent = t; }, 1500);
    } catch (e) {
      alert('Copie impossible : sélectionnez le texte et utilisez Ctrl+C.');
    }
  }

  /* ---------------- Échéancier ---------------- */

  function lignesFiltrees() {
    const auj = aujourdhui();
    const dans12 = O.ajouterMois(auj, 12);
    const f = etat.filtres;
    return O.echeancier(etat.copros, auj, regles()).filter((e) => {
      if (f.copro && e.coproId !== f.copro) return false;
      if (f.type && e.type !== f.type) return false;
      if (f.statut === 'actions') return ['retard', 'urgent', 'info'].includes(e.statut);
      if (f.statut === '12mois') return e.statut !== 'na' && (['retard', 'urgent', 'info'].includes(e.statut) || (e.date && e.date <= dans12));
      return true;
    });
  }

  function rendreFiltres() {
    const f = etat.filtres;
    $('#f-copro').innerHTML = `<option value="">Toutes (${etat.copros.length})</option>` + etat.copros.map((c) => `<option value="${c.id}"${c.id === f.copro ? ' selected' : ''}>${esc(c.nom || 'Sans nom')}</option>`).join('');
    $('#f-type').innerHTML = '<option value="">Toutes</option>' + Object.entries(O.TYPES).map(([k, v]) => `<option value="${k}"${k === f.type ? ' selected' : ''}>${esc(v)}</option>`).join('');
    $('#f-statut').value = f.statut;
  }

  function rendreEcheancier() {
    const auj = aujourdhui();
    const toutes = O.echeancier(etat.copros, auj, regles());
    const dans12 = O.ajouterMois(auj, 12);
    const compte = (s) => toutes.filter((e) => e.statut === s).length;
    const aVenir = toutes.filter((e) => e.statut === 'a_venir' && e.date && e.date <= dans12).length;
    $('#tuiles').innerHTML = [
      ['retard', compte('retard'), 'en retard'],
      ['urgent', compte('urgent'), `à traiter sous ${regles().joursUrgent} jours`],
      ['info', compte('info'), 'données à vérifier'],
      ['', aVenir, 'autres échéances sous 12 mois'],
      ['', etat.copros.length, 'copropriétés suivies'],
    ].map(([c, n, l]) => `<div class="tuile ${c}"><strong>${n}</strong><span>${esc(l)}</span></div>`).join('');

    const lignes = lignesFiltrees();
    const table = $('#table-echeancier');
    if (!etat.copros.length) {
      table.innerHTML = '<tbody><tr><td class="vide">Aucune copropriété. Ajoutez-en une, importez votre portefeuille depuis Excel ou chargez l\'exemple.</td></tr></tbody>';
      return;
    }
    if (!lignes.length) {
      table.innerHTML = '<tbody><tr><td class="vide">Rien à afficher avec ces filtres. 👍</td></tr></tbody>';
      return;
    }
    table.innerHTML = `<thead><tr><th>Échéance</th><th>Copropriété</th><th>Obligation</th><th>Statut</th><th>Détail et action</th></tr></thead><tbody>${lignes.map((e) => `
      <tr class="lien" data-copro="${e.coproId}">
        <td class="date">${O.fr(e.date)}${e.date && e.statut !== 'ok' && e.statut !== 'na' ? `<br><small>${delai(auj, e.date)}</small>` : ''}</td>
        <td>${esc(e.copro)}</td>
        <td><strong>${esc(O.TYPES[e.type])}</strong><br>${esc(e.libelle)}</td>
        <td>${badge(e.statut)}</td>
        <td class="detail">${esc(e.detail)}${e.action ? `<span class="action">→ ${esc(e.action)}</span>` : ''}${e.reference ? `<span class="ref">${esc(e.reference)}</span>` : ''}</td>
      </tr>`).join('')}</tbody>`;
  }

  function delai(auj, date) {
    const j = O.joursEntre(auj, date);
    if (j === 0) return "aujourd'hui";
    if (j < 0) return `il y a ${-j} j`;
    return j > 90 ? `dans ${Math.round(j / 30.4)} mois` : `dans ${j} j`;
  }

  /* ---------------- Liste et fiche ---------------- */

  function rendreListe() {
    const auj = aujourdhui();
    $('#liste-copros').innerHTML = etat.copros.map((c) => {
      const a = O.analyserCopro(c, auj, regles());
      const r = a.echeances.filter((e) => e.statut === 'retard').length;
      const u = a.echeances.filter((e) => e.statut === 'urgent').length;
      const pastille = r ? `<span class="compte" title="En retard">${r}</span>` : u ? `<span class="compte urgent" title="À traiter">${u}</span>` : '';
      return `<button type="button" class="item-copro${c.id === etat.selection ? ' actif' : ''}" data-id="${c.id}"><span>${esc(c.nom || 'Sans nom')}</span>${pastille}</button>`;
    }).join('') || '<p class="aide">Aucune copropriété.</p>';
  }

  function champHtml(c, [cle, libelle, type, extra]) {
    const v = c[cle];
    if (type === 'case') return `<label class="case"><input type="checkbox" data-c="${cle}"${v ? ' checked' : ''}> ${esc(libelle)}</label>`;
    if (type === 'choix') return `<label>${esc(libelle)}<select data-c="${cle}">${extra.map(([val, l]) => `<option value="${val}"${val === (v || '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    if (type === 'zone') return `<label class="large">${esc(libelle)}<textarea rows="3" data-c="${cle}">${esc(v)}</textarea></label>`;
    const t = type === 'nombre' ? 'number" step="any' : type === 'date' ? 'date' : 'text';
    return `<label>${esc(libelle)}<input type="${t}" data-c="${cle}" value="${esc(v == null ? '' : v)}"${extra ? ` placeholder="${esc(extra)}"` : ''}></label>`;
  }

  function rendreFiche() {
    const c = coproSel();
    const fiche = $('#fiche');
    if (!c) {
      fiche.innerHTML = '<p class="vide">Sélectionnez ou ajoutez une copropriété.</p>';
      return;
    }
    fiche.innerHTML = `
      <div class="barre"><span class="nom">${esc(c.nom || 'Nouvelle copropriété')}</span><button type="button" id="btn-suppr" class="btn-danger">Supprimer</button></div>
      ${SECTIONS.map((s) => `<fieldset><legend>${esc(s.titre)}</legend><div class="grille-champs">${s.champs.map((ch) => champHtml(c, ch)).join('')}</div>${s.titre === 'Fonds de travaux' ? '<p class="calcule" id="calc-fonds"></p>' : ''}</fieldset>`).join('')}`;
    majCalculFonds();
  }

  function majCalculFonds() {
    const c = coproSel();
    const el = $('#calc-fonds');
    if (!c || !el) return;
    const m = O.cotisationMinimale(c, regles());
    el.textContent = m.minimum == null ? '' : `Cotisation minimale calculée : ${O.eur(m.minimum)}${m.parPPT != null ? ` (max. de ${O.eur(m.parBudget || 0)} = 5 % du budget et ${O.eur(m.parPPT)} = 2,5 % du PPT)` : ' (5 % du budget prévisionnel)'}.`;
  }

  /* ---------------- Synthèse ---------------- */

  function rendreSynthese() {
    const c = coproSel();
    const zone = $('#synthese');
    if (!c) {
      $('#titre-synthese').textContent = 'Synthèse';
      zone.innerHTML = '<p class="vide">Sélectionnez une copropriété pour voir ses obligations, l\'ordre du jour réglementaire et la fiche du registre.</p>';
      return;
    }
    const auj = aujourdhui();
    const a = O.analyserCopro(c, auj, regles());
    $('#titre-synthese').textContent = `Synthèse — ${c.nom || 'Sans nom'}`;
    const odjTexte = a.ordreDuJour.map((o, i) => `${i + 1}. ${o.texte}`).join('\n');
    zone.innerHTML = `
      <p class="aide">${[a.age != null ? `Immeuble de ${a.age} ans` : null, a.lots.n != null ? `${a.lots.n} lots${a.lots.estime ? ' (total)' : ' principaux'}` : null, c.immatriculation ? `immatriculation ${esc(c.immatriculation)}` : null].filter(Boolean).join(' · ')} — situation au ${O.fr(auj)}</p>
      ${a.alertes.length ? `<ul class="liste-alertes">${a.alertes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="defilement"><table class="comparatif echeancier"><thead><tr><th>Obligation</th><th>Échéance</th><th>Statut</th><th>Détail</th></tr></thead><tbody>
      ${a.echeances.map((e) => `<tr><td><strong>${esc(O.TYPES[e.type])}</strong><br>${esc(e.libelle)}</td><td class="date">${O.fr(e.date)}</td><td>${badge(e.statut)}</td><td class="detail">${esc(e.detail)}${e.action ? `<span class="action">→ ${esc(e.action)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="synthese-grille" style="margin-top:16px">
        <div>
          <h3>Points réglementaires à inscrire à l'ordre du jour${c.dateProchaineAG ? ` (AG du ${O.fr(c.dateProchaineAG)})` : ''}</h3>
          ${a.ordreDuJour.length ? `<ol class="odj">${a.ordreDuJour.map((o) => `<li>${esc(o.texte)}</li>`).join('')}</ol>` : '<p class="aide">Aucun point réglementaire identifié.</p>'}
          <div class="no-print ligne-actions">
            ${a.ordreDuJour.length ? '<button type="button" id="btn-copier-odj">Copier l\'ordre du jour</button>' : ''}
            <button type="button" id="btn-imprimer-synthese">Imprimer la synthèse</button>
          </div>
        </div>
        <div>
          <h3>Fiche de mise à jour du registre</h3>
          <pre class="bloc-texte texte-source" style="white-space:pre-wrap;background:#f6f7f9;padding:10px;border-radius:6px;margin:0">${esc(O.ficheRegistre(c))}</pre>
          <div class="no-print ligne-actions">
            <button type="button" id="btn-copier-fiche">Copier la fiche</button>
            <button type="button" id="btn-maj-faite" class="btn-principal" title="Renseigne la date de mise à jour du registre à aujourd'hui">Mise à jour faite aujourd'hui</button>
            <a href="https://www.registre-coproprietes.gouv.fr" target="_blank" rel="noopener">Ouvrir le registre ↗</a>
          </div>
        </div>
      </div>`;
    zone.dataset.odj = odjTexte;
  }

  /* ---------------- Règles ---------------- */

  function rendreRegles() {
    const R = O.REGLES;
    const cal = (l) => l.map((e) => `${e.plusDe ? `plus de ${e.plusDe} lots` : 'autres'} : ${O.fr(e.date)}`).join(' ; ');
    $('#r-urgent').value = etat.reglages.joursUrgent;
    $('#r-rappel').value = etat.reglages.rappelJours;
    $('#regles').innerHTML = `<div class="defilement"><table class="regles"><thead><tr><th>Obligation</th><th>Règle appliquée</th><th>Référence</th></tr></thead><tbody>
      <tr><td>Registre des copropriétés</td><td>Mise à jour annuelle des données financières dans les ${R.registre.delaiMois} mois suivant l'AG ayant approuvé les comptes ; mise à jour aussi lors des changements (syndic, procédures, lots). À défaut, après mise en demeure, astreinte possible jusqu'à 20 € par lot et par semaine, non refacturable aux copropriétaires.</td><td>${esc(R.registre.reference)}</td></tr>
      <tr><td>PPPT</td><td>Immeubles d'habitation de plus de ${R.pppt.ageMinAns} ans. Exigible : ${cal(R.pppt.calendrier)} (lots à usage de logements, bureaux ou commerces). Actualisé tous les ${R.pppt.periodiciteAns} ans, présenté à la 1re AG suivant son élaboration. Dispense si DTG de moins de 10 ans sans besoin de travaux.</td><td>${esc(R.pppt.reference)}</td></tr>
      <tr><td>DTG</td><td>Immeubles de plus de ${R.dtg.ageMinAns} ans : l'AG se prononce sur sa réalisation. L'outil suit une validité de ${R.dtg.validiteAns} ans (dispenses PPPT / fonds de travaux) et propose de reposer la question à son échéance.</td><td>${esc(R.dtg.reference)}</td></tr>
      <tr><td>DPE collectif</td><td>Permis de construire antérieur au ${O.fr(R.dpe.permisAvant)} : ${cal(R.dpe.calendrier)}. Validité ${R.dpe.validiteAns} ans.</td><td>${esc(R.dpe.reference)}</td></tr>
      <tr><td>Fonds de travaux</td><td>Obligatoire ${R.fondsTravaux.ageMinAns} ans après la réception. Cotisation annuelle ≥ ${R.fondsTravaux.tauxBudget} % du budget prévisionnel et ≥ ${String(R.fondsTravaux.tauxPPT).replace('.', ',')} % du montant des travaux du PPT adopté. Dispense : moins de ${R.fondsTravaux.lotsDispense} lots par vote unanime, ou DTG sans besoin de travaux sur 10 ans.</td><td>${esc(R.fondsTravaux.reference)}</td></tr>
    </tbody></table></div>`;
  }

  /* ---------------- Exports / imports ---------------- */

  function exporterIcs() {
    const lignes = O.echeancier(etat.copros, aujourdhui(), regles()).filter((e) => !etat.filtres.copro || e.coproId === etat.filtres.copro);
    const horodatage = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = O.genererIcs(lignes, { rappelJours: Number(etat.reglages.rappelJours) || 0, horodatage });
    const n = (ics.match(/BEGIN:VEVENT/g) || []).length;
    if (!n) return alert('Aucune échéance datée à exporter.');
    telecharger(`Obligations copropriétés ${aujourdhui()}.ics`, ics, 'text/calendar;charset=utf-8');
  }

  function exporterExcel() {
    if (!window.XLSX) return alert('Module Excel indisponible.');
    const auj = aujourdhui();
    const wb = XLSX.utils.book_new();
    const toutes = O.echeancier(etat.copros, auj, regles());
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`Échéancier réglementaire au ${O.fr(auj)}`], [],
      ['Échéance', 'Copropriété', 'Obligation', 'Libellé', 'Statut', 'Détail', 'Action', 'Référence'],
      ...toutes.filter((e) => e.statut !== 'na').map((e) => [e.date ? new Date(e.date + 'T00:00:00') : '', e.copro, O.TYPES[e.type], e.libelle, O.STATUTS[e.statut], e.detail, e.action, e.reference]),
    ], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws1['!cols'] = [12, 28, 22, 34, 12, 70, 50, 50].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Échéancier');
    XLSX.utils.book_append_sheet(wb, feuillePortefeuille(etat.copros), 'Portefeuille');
    const ws3 = XLSX.utils.aoa_to_sheet(etat.copros.flatMap((c) => [...O.ficheRegistre(c).split('\n').map((l) => [l]), [], []]));
    ws3['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Fiches registre');
    XLSX.writeFile(wb, `Obligations copropriétés ${auj}.xlsx`);
  }

  function feuillePortefeuille(copros) {
    const cols = O.COLONNES;
    const val = (c, [cle, , t]) => {
      const v = c[cle];
      if (t === 'booleen') return v ? 'oui' : 'non';
      if (t === 'date') return v ? new Date(v + 'T00:00:00') : '';
      return v == null ? '' : v;
    };
    const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c[1]), ...copros.map((c) => cols.map((col) => val(c, col)))], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = cols.map((c) => ({ wch: Math.max(14, Math.min(40, c[1].length + 2)) }));
    return ws;
  }

  function telechargerModele() {
    if (!window.XLSX) return alert('Module Excel indisponible.');
    const wb = XLSX.utils.book_new();
    const exemple = O.nouvelleCopro({ nom: 'Résidence exemple (à remplacer)', adresse: '1 rue Exemple, 75000 Paris', lotsTotal: 48, lotsPrincipaux: 32, dateReception: '1978-01-01', dateAGComptes: '2026-05-20', budgetPrevisionnel: 85000, cotisationFonds: 4250 });
    XLSX.utils.book_append_sheet(wb, feuillePortefeuille(etat.copros.length ? etat.copros : [exemple]), 'Portefeuille');
    const aide = XLSX.utils.aoa_to_sheet([
      ['Mode d’emploi'],
      ['Une ligne par copropriété. Seule la colonne « Copropriété » est obligatoire ; les autres peuvent rester vides.'],
      ['Dates : JJ/MM/AAAA (ou l’année seule pour la construction). Oui/non : « oui » ou « non ».'],
      ['Importez ensuite le fichier avec le bouton « Importer Excel… » : les copropriétés de même nom sont mises à jour, les autres ajoutées.'],
    ]);
    aide['!cols'] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, aide, 'Mode d’emploi');
    XLSX.writeFile(wb, 'Modèle portefeuille copropriétés.xlsx');
  }

  async function importerExcel(fichier) {
    if (!window.XLSX) return alert('Module Excel indisponible.');
    try {
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets['Portefeuille'] || wb.Sheets[wb.SheetNames[0]];
      const lignes = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      const importees = O.importerLignes(lignes);
      if (!importees.length) return alert("Aucune copropriété trouvée. Vérifiez que la première ligne contient les en-têtes du modèle (au minimum « Copropriété »).");
      let ajouts = 0;
      let majs = 0;
      for (const n of importees) {
        const ex = etat.copros.find((c) => c.nom.trim().toLowerCase() === n.nom.trim().toLowerCase());
        if (ex) {
          const garde = Object.fromEntries(Object.entries(n).filter(([k, v]) => k !== 'id' && v !== '' && v != null));
          Object.assign(ex, garde);
          majs++;
        } else {
          etat.copros.push(n);
          ajouts++;
        }
      }
      if (!etat.selection && etat.copros.length) etat.selection = etat.copros[0].id;
      toutRendre();
      sauver();
      alert(`Import terminé : ${ajouts} copropriété(s) ajoutée(s), ${majs} mise(s) à jour.`);
    } catch (e) {
      alert(`Lecture du fichier impossible : ${e.message}`);
    }
  }

  function imprimer(mode) {
    document.body.classList.toggle('impression-synthese', mode === 'synthese');
    $('#entete-impression').innerHTML = `<strong>Échéancier réglementaire des copropriétés</strong> — situation au ${O.fr(aujourdhui())}`;
    window.print();
    document.body.classList.remove('impression-synthese');
  }

  /* ---------------- Exemple ---------------- */

  function exemple() {
    const a = new Date().getFullYear();
    const e = etatVide();
    e.copros = [
      O.nouvelleCopro({ nom: 'Résidence Les Tilleuls', adresse: '12 rue des Lilas, 69003 Lyon', immatriculation: 'AB1234567', lotsTotal: 64, lotsPrincipaux: 38, dateReception: '1972-01-01', dateAGComptes: `${a}-06-12`, dateProchaineAG: `${a + 1}-06-10`, exerciceClos: `${a - 1}-12-31`, chargesCourantes: 92450, chargesExceptionnelles: 18600, dettesFournisseurs: 7320, impayes: 11840, debiteurs300: 4, salaries: 'non', budgetPrevisionnel: 95000, cotisationFonds: 4750, soldeFonds: 21400, dtgQuestionAG: `${a - 2}-06-08` }),
      O.nouvelleCopro({ nom: 'Le Clos des Vignes', adresse: '4 allée des Vignes, 69110 Sainte-Foy-lès-Lyon', immatriculation: 'AC7654321', lotsTotal: 18, lotsPrincipaux: 12, dateReception: '2003-09-15', dateAGComptes: `${a}-04-03`, dateMajRegistre: `${a}-05-20`, dateProchaineAG: `${a + 1}-04-02`, budgetPrevisionnel: 32000, cotisationFonds: 2500, soldeFonds: 9800, ppptDate: `${a}-09-30`, montantTravauxPPT: 240000 }),
      O.nouvelleCopro({ nom: 'Les Terrasses du Parc', adresse: '27 avenue du Parc, 69006 Lyon', immatriculation: '', lotsTotal: 310, lotsPrincipaux: 220, dateReception: '1968-01-01', datePermis: '1965-03-01', dateAGComptes: `${a}-10-08`, dateProchaineAG: `${a + 1}-10-07`, budgetPrevisionnel: 410000, cotisationFonds: 20500, soldeFonds: 186000, ppptDate: `${a - 3}-11-15`, ppptPresenteAG: `${a - 2}-06-20`, pptAdopte: 'oui', montantTravauxPPT: 2400000, dpeDate: `${a - 3}-11-15`, dtgQuestionAG: `${a - 2}-06-20` }),
      O.nouvelleCopro({ nom: 'Villa Bellevue', adresse: '3 chemin Bellevue, 69300 Caluire', immatriculation: 'AD1122334', lotsTotal: 8, lotsPrincipaux: 6, dateReception: '2012-07-01', datePermis: '2010-02-01', dateAGComptes: `${a}-03-15`, dateMajRegistre: `${a}-04-02`, budgetPrevisionnel: 14000, dispenseFondsUnanime: true, dtgDate: `${a - 1}-02-10`, dtgAucunTravaux: true }),
    ];
    e.selection = e.copros[0].id;
    return e;
  }

  /* ---------------- Rendu et événements ---------------- */

  function toutRendre() {
    rendreFiltres();
    rendreEcheancier();
    rendreListe();
    rendreFiche();
    rendreSynthese();
    rendreRegles();
  }

  function apresSaisie() {
    sauver();
    rendreEcheancier();
    rendreListe();
    rendreSynthese();
    majCalculFonds();
    rendreFiltres();
  }

  function selectionner(id) {
    etat.selection = id;
    sauver();
    rendreListe();
    rendreFiche();
    rendreSynthese();
  }

  function brancher() {
    const champsType = Object.fromEntries(SECTIONS.flatMap((s) => s.champs.map(([k, , t]) => [k, t])));

    $('#fiche').addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-c]');
      const c = coproSel();
      if (!el || !c) return;
      const cle = el.dataset.c;
      const t = champsType[cle];
      c[cle] = t === 'case' ? el.checked : t === 'nombre' ? O.nombre(el.value) : el.value;
      if (cle === 'nom') $('.fiche .barre .nom').textContent = el.value || 'Nouvelle copropriété';
      apresSaisie();
    });
    $('#fiche').addEventListener('change', (ev) => { if (ev.target.type === 'checkbox') ev.target.dispatchEvent(new Event('input', { bubbles: true })); });
    $('#fiche').addEventListener('click', (ev) => {
      if (ev.target.id !== 'btn-suppr') return;
      const c = coproSel();
      if (!c || !confirm(`Supprimer « ${c.nom || 'Sans nom'} » du portefeuille ?`)) return;
      etat.copros = etat.copros.filter((x) => x.id !== c.id);
      etat.selection = etat.copros[0] ? etat.copros[0].id : '';
      if (etat.filtres.copro === c.id) etat.filtres.copro = '';
      sauver();
      toutRendre();
    });

    $('#liste-copros').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-id]');
      if (b) selectionner(b.dataset.id);
    });
    $('#btn-ajout').addEventListener('click', () => {
      const c = O.nouvelleCopro();
      etat.copros.push(c);
      etat.selection = c.id;
      sauver();
      toutRendre();
      const champ = $('#fiche [data-c="nom"]');
      if (champ) champ.focus();
    });

    $('#table-echeancier').addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-copro]');
      if (!tr) return;
      selectionner(tr.dataset.copro);
      $('#section-synthese').scrollIntoView({ behavior: 'smooth' });
    });

    for (const [id, cle] of [['#f-copro', 'copro'], ['#f-type', 'type'], ['#f-statut', 'statut']]) {
      $(id).addEventListener('change', (ev) => { etat.filtres[cle] = ev.target.value; sauver(); rendreEcheancier(); });
    }

    $('#synthese').addEventListener('click', (ev) => {
      const c = coproSel();
      if (!c) return;
      if (ev.target.id === 'btn-copier-odj') copier($('#synthese').dataset.odj || '', ev.target);
      if (ev.target.id === 'btn-copier-fiche') copier(O.ficheRegistre(c), ev.target);
      if (ev.target.id === 'btn-imprimer-synthese') imprimer('synthese');
      if (ev.target.id === 'btn-maj-faite') {
        c.dateMajRegistre = aujourdhui();
        sauver();
        toutRendre();
      }
    });

    $('#r-urgent').addEventListener('input', (ev) => { etat.reglages.joursUrgent = O.nombre(ev.target.value) ?? O.REGLES.joursUrgent; apresSaisie(); });
    $('#r-rappel').addEventListener('input', (ev) => { etat.reglages.rappelJours = O.nombre(ev.target.value) ?? 0; sauver(); });

    $('#btn-ics').addEventListener('click', exporterIcs);
    $('#btn-excel').addEventListener('click', exporterExcel);
    $('#btn-imprimer').addEventListener('click', () => imprimer('echeancier'));
    $('#btn-modele').addEventListener('click', telechargerModele);
    $('#btn-importer').addEventListener('click', () => $('#input-excel').click());
    $('#input-excel').addEventListener('change', (ev) => { if (ev.target.files[0]) importerExcel(ev.target.files[0]); ev.target.value = ''; });
    $('#btn-sauver').addEventListener('click', () => telecharger(`Portefeuille copropriétés ${aujourdhui()}.json`, JSON.stringify(etat, null, 2), 'application/json'));
    $('#btn-ouvrir').addEventListener('click', () => $('#input-json').click());
    $('#input-json').addEventListener('change', async (ev) => {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      try {
        etat = normaliser(JSON.parse(await f.text()));
        sauver();
        toutRendre();
      } catch (e) {
        alert('Fichier illisible.');
      }
    });
    $('#btn-exemple').addEventListener('click', () => {
      if (etat.copros.length && !confirm('Remplacer le portefeuille actuel par l’exemple ?')) return;
      etat = exemple();
      sauver();
      toutRendre();
    });
    $('#btn-nouveau').addEventListener('click', () => {
      if (etat.copros.length && !confirm('Vider le portefeuille ? Pensez à l’enregistrer avant.')) return;
      etat = etatVide();
      sauver();
      toutRendre();
    });
  }

  if (!etat.selection && etat.copros.length) etat.selection = etat.copros[0].id;
  brancher();
  toutRendre();
})();

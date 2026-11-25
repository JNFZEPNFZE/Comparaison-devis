/*
 * Extraction des informations clés d'un devis à partir de son texte.
 * Fonctions pures, utilisables dans le navigateur (window.Extraction)
 * et sous Node (module.exports) pour les tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Extraction = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MOIS = {
    janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11,
    decembre: 12, décembre: 12,
  };

  function normaliserEspaces(s) {
    return String(s || '').replace(/[    \t]/g, ' ');
  }

  /* ---------- Reconstruction des lignes depuis les éléments pdf.js ---------- */

  /**
   * items : [{ str, x, y, w, h }] (y croissant vers le haut, comme dans un PDF).
   * Regroupe les fragments situés sur la même ligne et les trie de gauche à droite.
   */
  function reconstruireLignes(items) {
    const elems = items
      .filter((it) => it && typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => ({ ...it, h: it.h || 10, w: it.w || 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lignes = [];
    for (const it of elems) {
      const tol = Math.max(2, it.h * 0.4);
      let ligne = lignes.find((l) => Math.abs(l.y - it.y) <= tol);
      if (!ligne) {
        ligne = { y: it.y, items: [] };
        lignes.push(ligne);
      }
      ligne.items.push(it);
    }
    lignes.sort((a, b) => b.y - a.y);

    return lignes.map((l) => {
      l.items.sort((a, b) => a.x - b.x);
      let txt = '';
      let finPrec = null;
      for (const it of l.items) {
        if (finPrec !== null) {
          const ecart = it.x - finPrec;
          if (ecart > it.h * 1.5) txt += '   ';
          else if (ecart > 0.5 && !/\s$/.test(txt) && !/^\s/.test(it.str)) txt += ' ';
        }
        txt += it.str;
        finPrec = it.x + it.w;
      }
      return normaliserEspaces(txt).replace(/\s+$/, '');
    });
  }

  /* ---------- Montants ---------- */

  const RE_MONTANT = /(?<![\d,./-])(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2}))?(?![\d/])/g;

  function parseMontant(texte) {
    const m = montantsDansLigne(String(texte));
    return m.length ? m[0].valeur : null;
  }

  /** Renvoie les montants présents dans une ligne (les pourcentages sont exclus). */
  function montantsDansLigne(ligne) {
    const s = normaliserEspaces(ligne);
    const res = [];
    RE_MONTANT.lastIndex = 0;
    let m;
    while ((m = RE_MONTANT.exec(s))) {
      const fin = m.index + m[0].length;
      const suite = s.slice(fin);
      if (/^\s*%/.test(suite)) continue;
      // « 12 m² », « 3 ml », etc. : quantités, pas des montants
      if (/^\s*(m²|m2|m3|ml|u\b|ens\b|h\b|kg|jours?|semaines?|mois|ans?)/i.test(suite)) continue;
      const entier = m[1].replace(/[ .]/g, '');
      const dec = m[2] || m[3] || '0';
      const valeur = Number(entier + '.' + dec);
      if (!Number.isFinite(valeur)) continue;
      res.push({
        valeur,
        index: m.index,
        fin,
        euro: /^\s*(€|eur\b|euros?\b)/i.test(suite),
        decimales: Boolean(m[2] || m[3]),
      });
    }
    return res;
  }

  /* ---------- Libellés HT / TVA / TTC ---------- */

  const LIBELLES = [
    { type: 'TTC', re: /\bT\.?\s?T\.?\s?C\b\.?|toutes\s+taxes\s+comprises|net\s+[àa]\s+payer|montant\s+[àa]\s+payer/gi },
    { type: 'HT', re: /\bH\.?\s?T\b\.?|hors\s+tax(?:es?)?/g },
    { type: 'TVA', re: /\bT\.?\s?V\.?\s?A\b\.?/gi },
  ];
  const RE_HT_INSENSIBLE = /hors\s+tax/i;
  const RE_LIGNE_EXCLUE = /intra|n°\s*(de\s*)?tva|num[ée]ro\s+(de\s+)?tva|non\s+applicable|autoliquidation|siret|siren|rcs|capital/i;
  const RE_SOUS_TOTAL = /sous[\s-]?total|report|acompte|situation|unitaire|\bp\.?\s?u\b\.?|brut/i;

  function libellesDansLigne(ligne) {
    const trouves = [];
    for (const { type, re } of LIBELLES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(ligne))) trouves.push({ type, index: m.index, fin: m.index + m[0].length });
    }
    // « hors taxes » peut être en minuscules
    const m = RE_HT_INSENSIBLE.exec(ligne);
    if (m && !trouves.some((t) => t.type === 'HT' && t.index === m.index)) {
      trouves.push({ type: 'HT', index: m.index, fin: m.index + m[0].length });
    }
    return trouves.sort((a, b) => a.index - b.index);
  }

  function tauxDansLigne(ligne) {
    const res = [];
    const re = /(\d{1,2}(?:[,.]\d{1,2})?)\s*%/g;
    let m;
    while ((m = re.exec(ligne))) res.push(Number(m[1].replace(',', '.')));
    return res;
  }

  /**
   * Parcourt les lignes et collecte les candidats { HT: [], TVA: [], TTC: [] }.
   * Chaque candidat : { valeur, ligne (n°), secondaire (sous-total, remise…) }.
   */
  function collecterCandidats(lignes) {
    const cand = { HT: [], TVA: [], TTC: [] };
    const taux = [];

    lignes.forEach((ligne, i) => {
      if (RE_LIGNE_EXCLUE.test(ligne)) return;
      const libs = libellesDansLigne(ligne);
      if (!libs.length) return;
      const secondaire = RE_SOUS_TOTAL.test(ligne);
      const montants = montantsDansLigne(ligne);

      if (libs.some((l) => l.type === 'TVA')) taux.push(...tauxDansLigne(ligne));

      // 1) Montants situés après chaque libellé, sur la même ligne
      let trouveSurLigne = false;
      libs.forEach((lib, k) => {
        const limite = k + 1 < libs.length ? libs[k + 1].index : Infinity;
        const apres = montants.filter((m) => m.index >= lib.fin && m.index < limite);
        if (apres.length) {
          trouveSurLigne = true;
          // Le dernier montant du segment est en général le total de la colonne
          cand[lib.type].push({ valeur: apres[apres.length - 1].valeur, ligne: i, secondaire });
        }
      });
      if (trouveSurLigne) return;

      // 2) Libellés en en-tête de colonnes : valeurs sur la ligne suivante
      const suivante = lignes[i + 1];
      if (!suivante || libellesDansLigne(suivante).length) return;
      const mSuiv = montantsDansLigne(suivante);
      if (!mSuiv.length) return;
      if (libs.length > 1 && mSuiv.length >= libs.length) {
        const decal = mSuiv.length - libs.length;
        libs.forEach((lib, k) => cand[lib.type].push({ valeur: mSuiv[decal + k].valeur, ligne: i + 1, secondaire }));
      } else if (libs.length === 1) {
        cand[libs[0].type].push({ valeur: mSuiv[mSuiv.length - 1].valeur, ligne: i + 1, secondaire: true });
      }
    });

    return { cand, taux: [...new Set(taux)].filter((t) => t > 0 && t < 30) };
  }

  const TAUX_USUELS = [20, 10, 5.5, 2.1];

  function arrondi2(x) {
    return Math.round(x * 100) / 100;
  }

  /** Cherche le triplet HT + TVA = TTC le plus plausible. */
  function determinerMontants(lignes) {
    const { cand, taux } = collecterCandidats(lignes);
    const tol = (ttc) => Math.max(0.06, ttc * 0.0005);
    const uniq = (arr) => {
      const vus = new Map();
      for (const c of arr) {
        const prec = vus.get(c.valeur);
        if (!prec || (prec.secondaire && !c.secondaire) || (prec.secondaire === c.secondaire && c.ligne > prec.ligne)) vus.set(c.valeur, c);
      }
      return [...vus.values()].filter((c) => c.valeur > 0);
    };
    const HT = uniq(cand.HT);
    const TVA = uniq(cand.TVA);
    const TTC = uniq(cand.TTC);

    // a) Triplet cohérent avec TVA explicite
    let meilleur = null;
    const score = (t) => t.ttc.valeur + (t.ttc.secondaire ? 0 : 1e12) + (t.ht.secondaire ? 0 : 1e11);
    for (const ttc of TTC) {
      for (const ht of HT) {
        if (ht.valeur >= ttc.valeur + tol(ttc.valeur)) continue;
        for (const tva of TVA) {
          if (Math.abs(ht.valeur + tva.valeur - ttc.valeur) <= tol(ttc.valeur)) {
            const t = { ht, tva, ttc };
            if (!meilleur || score(t) > score(meilleur)) meilleur = t;
          }
        }
      }
    }
    if (meilleur) {
      const r = (meilleur.tva.valeur / meilleur.ht.valeur) * 100;
      return {
        montantHT: meilleur.ht.valeur,
        montantTVA: meilleur.tva.valeur,
        montantTTC: meilleur.ttc.valeur,
        tauxTVA: tauxPlausible(r, taux),
        confiance: 'haute',
      };
    }

    // b) HT × (1 + taux) = TTC
    const tauxTest = [...new Set([...taux, ...TAUX_USUELS])];
    let inf = null;
    for (const ttc of TTC) {
      for (const ht of HT) {
        for (const t of tauxTest) {
          if (Math.abs(ht.valeur * (1 + t / 100) - ttc.valeur) <= Math.max(0.06, ttc.valeur * 0.001)) {
            const c = { ht, ttc, t };
            if (!inf || score({ ...c, tva: null }) > score({ ...inf, tva: null })) inf = c;
          }
        }
      }
    }
    if (inf) {
      return {
        montantHT: inf.ht.valeur,
        montantTVA: arrondi2(inf.ttc.valeur - inf.ht.valeur),
        montantTTC: inf.ttc.valeur,
        tauxTVA: inf.t,
        confiance: 'moyenne',
      };
    }

    // c) Repli : derniers totaux principaux trouvés
    const dernier = (arr) => {
      const princ = arr.filter((c) => !c.secondaire);
      const src = princ.length ? princ : arr;
      return src.length ? src.reduce((a, b) => (b.ligne >= a.ligne ? b : a)).valeur : null;
    };
    const ht = dernier(HT);
    const ttc = dernier(TTC);
    let tva = dernier(TVA);
    const tx = taux.length === 1 ? taux[0] : null;
    let montantHT = ht;
    let montantTTC = ttc;
    if (montantHT != null && montantTTC == null && tx != null) montantTTC = arrondi2(montantHT * (1 + tx / 100));
    if (montantTTC != null && montantHT == null && tx != null) montantHT = arrondi2(montantTTC / (1 + tx / 100));
    if (tva == null && montantHT != null && montantTTC != null) tva = arrondi2(montantTTC - montantHT);
    const trouve = [montantHT, montantTTC].filter((v) => v != null).length;
    return {
      montantHT,
      montantTVA: tva,
      montantTTC,
      tauxTVA: tx != null ? tx : montantHT && montantTTC ? tauxPlausible(((montantTTC - montantHT) / montantHT) * 100, taux) : null,
      confiance: trouve ? 'faible' : 'aucune',
    };
  }

  function tauxPlausible(r, tauxTrouves) {
    const candidats = [...tauxTrouves, ...TAUX_USUELS];
    let best = null;
    for (const t of candidats) if (Math.abs(t - r) < 0.15 && (best == null || Math.abs(t - r) < Math.abs(best - r))) best = t;
    return best != null ? best : Math.round(r * 100) / 100;
  }

  /* ---------- Dates ---------- */

  function isoDate(j, m, a) {
    if (a < 100) a += 2000;
    if (m < 1 || m > 12 || j < 1 || j > 31 || a < 2000 || a > 2100) return null;
    return `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  }

  const RE_DATE_NUM = /(?<!\d)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?!\d)/;
  const RE_DATE_TXT = /(?<!\d)(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i;

  function parseDate(s) {
    if (!s) return null;
    let m = RE_DATE_NUM.exec(s);
    if (m) return isoDate(+m[1], +m[2], +m[3]);
    m = RE_DATE_TXT.exec(s);
    if (m) return isoDate(+m[1], MOIS[m[2].toLowerCase().replace('û', 'u')] || MOIS[m[2].toLowerCase()], +m[3]);
    return null;
  }

  function ajouterJours(iso, jours) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- SIRET ---------- */

  function siretValide(siret) {
    const s = String(siret || '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(s)) return false;
    if (s.startsWith('356000000')) return true; // La Poste : règle particulière
    let somme = 0;
    for (let i = 0; i < 14; i++) {
      let d = +s[13 - i];
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      somme += d;
    }
    return somme % 10 === 0;
  }

  /* ---------- Analyse complète ---------- */

  const RE_FORME = /\b(SARL|SAS|SASU|EURL|SA|SCOP|SNC|EIRL|EI|SCI)\b/;
  const RE_CLIENT = /syndic|copropri|r[ée]sidence|\bSDC\b|client|destinataire|adress[ée]\s+[àa]|à l'attention|immeuble/i;
  const RE_PAS_NOM = /^(devis|facture|proposition|date|page|tél|tel|fax|email|e-mail|mail|www\.|http|objet|référence|ref)/i;

  function nettoyerNom(l) {
    return l
      .split(/\s{3,}/)[0]
      .replace(/\s+au\s+capital.*$/i, '')
      .replace(/\s*[-–,]\s*(siret|siren|rcs).*$/i, '')
      .trim();
  }

  function trouverPrestataire(lignes) {
    const tete = lignes.slice(0, 25);
    // 1) Ligne avec une forme juridique, hors bloc client
    for (const l of tete) {
      if (RE_FORME.test(l) && !RE_CLIENT.test(l) && !/capital/i.test(l.split(RE_FORME)[0])) {
        const nom = nettoyerNom(l);
        if (/[a-zA-Z]{2}/.test(nom)) return nom;
      }
    }
    // 2) Mentions légales en pied de page : « X SARL au capital de … »
    for (const l of lignes) {
      const m = /^(.{2,60}?)\s*[-–,]?\s*\b(SARL|SAS|SASU|EURL|SA|SCOP|SNC)\b.*capital/i.exec(l);
      if (m && !RE_CLIENT.test(m[1])) return `${m[1].trim()} ${m[2]}`.trim();
    }
    // 3) Première ligne « textuelle » du document
    for (const l of tete) {
      const t = l.split(/\s{3,}/)[0].trim();
      if (t.length >= 3 && /[a-zA-Z]{3}/.test(t) && !RE_PAS_NOM.test(t) && !RE_CLIENT.test(t) && !/\d{2}[\/.]\d{2}/.test(t)) return t;
    }
    return '';
  }

  function enJours(n, unite) {
    unite = unite.toLowerCase();
    if (unite.startsWith('sem')) return n * 7;
    if (unite.startsWith('mois')) return n * 30;
    return n;
  }

  /**
   * Analyse le texte d'un devis (lignes déjà reconstituées ou texte brut).
   * Renvoie un objet avec les champs détectés ; les champs non trouvés valent null.
   */
  function analyserDevis(entree) {
    const lignes = (Array.isArray(entree) ? entree : String(entree || '').split(/\r?\n/))
      .map((l) => normaliserEspaces(l).replace(/\s+$/, ''))
      .filter((l) => l.trim() !== '');
    const texte = lignes.join('\n');
    const texteCompact = texte.replace(/\s+/g, ' ');

    const res = {
      prestataire: trouverPrestataire(lignes),
      siret: null,
      numero: null,
      date: null,
      validiteDate: null,
      delaiJours: null,
      delaiTexte: null,
      decennale: 'a_verifier',
      assureur: null,
      acomptePct: null,
      certifications: [],
      ...determinerMontants(lignes),
    };

    // SIRET (14 chiffres) ou à défaut SIREN
    let m = /siret\s*(?:n°|:)?\s*:?\s*(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})/i.exec(texteCompact) ||
      /(?<!\d)(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})(?!\d)/.exec(texteCompact);
    if (m) res.siret = m[1].replace(/\s/g, '');

    // Numéro de devis
    m = /devis\s*(?:n°|n[o°º]\.?|num(?:[ée]ro)?\.?|#|réf(?:érence)?\.?)\s*:?\s*([A-Z0-9][A-Z0-9\-\/_.]*[A-Z0-9])/i.exec(texteCompact);
    if (m) res.numero = m[1];

    // Date du devis
    for (const l of lignes) {
      if (/valid|valable|échéance|expir|livraison|début|démarrage/i.test(l)) continue;
      if (/date|le\s+\d|fait\s+[àa]|du\s+\d|devis/i.test(l)) {
        const d = parseDate(l);
        if (d) {
          res.date = d;
          break;
        }
      }
    }
    if (!res.date) {
      const d = parseDate(texte);
      if (d) res.date = d;
    }

    // Validité
    m = /(?:valid[a-zé]*|valable)[^\n]{0,60}?(\d{1,3})\s*(jours?|mois|semaines?)/i.exec(texte);
    if (m && res.date) res.validiteDate = ajouterJours(res.date, enJours(+m[1], m[2]));
    if (!res.validiteDate) {
      m = /(?:valid[a-zé]*|valable|expir[a-zé]*)[^\n]{0,40}?(?:jusqu.?au|au|le)\s*([^\n]{6,20})/i.exec(texte);
      if (m) res.validiteDate = parseDate(m[1]);
    }

    // Délai / durée d'exécution
    m = /(d[ée]lai|dur[ée]e)[^\n]{0,60}?(\d{1,3})\s*(jours?|semaines?|mois)(\s+ouvr[ée]s)?/i.exec(texte);
    if (m) {
      res.delaiJours = enJours(+m[2], m[3]);
      res.delaiTexte = `${m[2]} ${m[3]}${m[4] || ''}`.trim();
    }

    // Garantie décennale
    const ligneDec = lignes.find((l) => /d[ée]cennale/i.test(l));
    if (ligneDec) {
      res.decennale = 'oui';
      const a = /(?:aupr[eè]s\s+(?:de\s+)?|assureur\s*:?\s*|souscrite\s+(?:chez|auprès de)\s+|d[ée]cennale\s*:\s*)([A-Z][\w&.\- ]{2,40})/i.exec(ligneDec);
      if (a) res.assureur = a[1].trim().replace(/[\s,.;-]+$/, '');
    }

    // Acompte
    m = /acompte[^\n%]{0,40}?(\d{1,2}(?:[,.]\d+)?)\s*%/i.exec(texte) || /(\d{1,2}(?:[,.]\d+)?)\s*%[^\n]{0,20}acompte/i.exec(texte);
    if (m) res.acomptePct = Number(m[1].replace(',', '.'));

    // Certifications et labels
    const certifs = [
      [/qualibat/i, 'Qualibat'],
      [/\bRGE\b/, 'RGE'],
      [/qualifelec/i, 'Qualifelec'],
      [/qualit[ée]\s*eNR|QualiPAC|QualiSol|Qualibois/i, 'Qualité EnR'],
      [/\bMASE\b/, 'MASE'],
      [/\bISO\s*9001/i, 'ISO 9001'],
      [/amiante|SS[34]/i, 'Amiante (SS3/SS4)'],
    ];
    res.certifications = certifs.filter(([re]) => re.test(texte)).map(([, nom]) => nom);

    return res;
  }

  return {
    reconstruireLignes,
    montantsDansLigne,
    parseMontant,
    parseDate,
    ajouterJours,
    siretValide,
    analyserDevis,
    determinerMontants,
  };
});

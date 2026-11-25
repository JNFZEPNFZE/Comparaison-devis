# Comparaison de devis — copropriété

Outil local pour comparer les devis des prestataires et préparer les documents de l'assemblée générale (AG) et des réunions du conseil syndical.

**Aucune installation ni connexion Internet requise** : ouvrez `index.html` dans votre navigateur (Chrome, Edge, Firefox). Les PDF sont lus sur votre ordinateur, rien n'est envoyé en ligne.

## Utilisation

1. **Dossier** : copropriété, objet des travaux, date de l'AG, budget, majorité, clé de répartition, tantièmes, honoraires du syndic.
2. **Devis** : glissez les PDF dans la zone de dépôt. Pour chaque devis, l'outil lit automatiquement :
   - le prestataire, le SIRET (avec contrôle de validité), le n° et la date du devis ;
   - les montants **HT, TVA, TTC** (avec contrôle de cohérence HT + TVA = TTC, gestion des remises et des sous-totaux) ;
   - la durée de validité, le délai d'exécution, l'acompte, l'assurance décennale et les certifications (Qualibat, RGE…).

   Un badge indique la fiabilité de la lecture : **vérifiez toujours les champs**, ils restent modifiables. Les devis papier ou scannés peuvent être saisis avec « Ajouter un devis manuellement ».
3. **Critères** : ajustez la pondération (par défaut prix 50 %, technique 20 %, délai 10 %, garanties 10 %, références 10 %) et notez sur chaque devis la qualité technique et les références (0 à 5).
4. **Tableau comparatif** : classement, écarts avec le moins-disant et le budget, coût total avec honoraires, coût pour 1 000 tantièmes, points d'attention (devis expiré avant l'AG, décennale manquante, TVA inhabituelle, acompte élevé, prix anormalement bas…).
5. **Note de recommandation** : texte généré avec l'analyse, la recommandation du conseil syndical et un **projet de résolution** ; il est modifiable avant impression.

### Livrables

| Bouton | Résultat |
| --- | --- |
| Tableau comparatif → *Imprimer / PDF* | Tableau A4 paysage à joindre à la convocation (choisir « Enregistrer au format PDF ») |
| *Exporter Excel* | Classeur `.xlsx` : comparatif, détail des devis, note |
| Note → *Imprimer / PDF* | Note du conseil syndical et projet de résolution, A4 portrait |
| *Enregistrer le dossier* | Fichier `.json` pour reprendre le travail ou le transmettre à un autre membre du conseil |

Le travail en cours est aussi conservé automatiquement dans le navigateur.

### Essayer

Cliquez sur « Charger un exemple », ou déposez les trois devis fictifs du dossier `exemples/`.

## Limites

- Les PDF **scannés** (images) ne contiennent pas de texte : saisissez les montants à la main.
- La lecture automatique repose sur les libellés usuels (« Total HT », « TVA 10 % », « Net à payer TTC »…). Une mise en page inhabituelle peut tromper l'outil : le badge « à vérifier » le signale.
- Le projet de résolution est un modèle : faites-le valider par le syndic (majorité applicable, échéancier des appels de fonds).

## Développement

- `index.html`, `css/style.css`, `js/app.js` : interface.
- `js/extraction.js` : lecture du texte des devis (fonctions pures, testées).
- `vendor/` : [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache 2.0) et [SheetJS](https://sheetjs.com) 0.18.5 (Apache 2.0), embarqués pour fonctionner hors ligne.
- Tests : `node --test tests/*.test.js` (Node 18+).
- Régénérer les PDF d'exemple : `python3 outils/generer_exemples.py` (nécessite `reportlab`).

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

## Obligations réglementaires (`obligations.html`)

Second outil, accessible depuis l'en-tête : suivi d'un **portefeuille de copropriétés** et calcul automatique des échéances.

| Obligation | Ce que calcule l'outil |
| --- | --- |
| **Registre des copropriétés** | Date limite de la mise à jour annuelle (2 mois après l'AG d'approbation des comptes), retard si la mise à jour n'est pas faite, prochaine échéance d'après la date de la prochaine AG. **Fiche de mise à jour** prête à recopier sur registre-coproprietes.gouv.fr (charges, dettes fournisseurs, impayés, débiteurs > 300 €, fonds de travaux…). |
| **PPPT** | Date d'exigibilité selon le nombre de lots principaux (> 200 : 2023, 51–200 : 2024, ≤ 50 : 2025) et l'âge de l'immeuble (> 15 ans), présentation en AG, actualisation tous les 10 ans, dispense par DTG. |
| **DTG** | Question à soumettre à l'AG (immeuble > 10 ans), fin de validité à 10 ans. |
| **DPE collectif** | Calendrier selon le nombre de lots (permis antérieur à 2013), renouvellement à 10 ans. |
| **Fonds de travaux** | Cotisation minimale = max(5 % du budget prévisionnel ; 2,5 % des travaux du PPT adopté), contrôle de la cotisation votée, dispenses. |

Livrables : **échéancier** filtrable (retards, urgences, 12 mois), **export agenda `.ics`** avec rappel (Outlook, Google Agenda…), **export Excel** (échéancier, portefeuille, fiches registre), **points d'ordre du jour** réglementaires par copropriété, impression.

Import du portefeuille : « Modèle Excel » fournit le classeur à remplir (une ligne par copropriété), « Importer Excel… » le relit (les copropriétés de même nom sont mises à jour). Après chaque AG, mettez à jour les dates et les chiffres de l'exercice : l'échéancier se recalcule.

Les règles et leurs références sont rappelées en bas de page (`js/obligations.js`, objet `REGLES`). **Elles résument la réglementation à la date de rédaction : faites valider les échéances par le syndic avant de les communiquer.**

## Limites

- Les PDF **scannés** (images) ne contiennent pas de texte : saisissez les montants à la main.
- La lecture automatique repose sur les libellés usuels (« Total HT », « TVA 10 % », « Net à payer TTC »…). Une mise en page inhabituelle peut tromper l'outil : le badge « à vérifier » le signale.
- Le projet de résolution est un modèle : faites-le valider par le syndic (majorité applicable, échéancier des appels de fonds).

## Développement

- `index.html`, `css/style.css`, `js/app.js` : interface.
- `js/extraction.js` : lecture du texte des devis (fonctions pures, testées).
- `obligations.html`, `css/obligations.css`, `js/app-obligations.js` : outil Obligations réglementaires ; `js/obligations.js` : règles et calcul des échéances (fonctions pures, testées).
- `vendor/` : [pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache 2.0) et [SheetJS](https://sheetjs.com) 0.18.5 (Apache 2.0), embarqués pour fonctionner hors ligne.
- Tests : `node --test tests/*.test.js` (Node 18+).
- Régénérer les PDF d'exemple : `python3 outils/generer_exemples.py` (nécessite `reportlab`).

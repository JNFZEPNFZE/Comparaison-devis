"""Génère trois devis PDF fictifs dans exemples/ pour essayer l'import.

Usage : python3 outils/generer_exemples.py   (nécessite reportlab)
"""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

SORTIE = Path(__file__).resolve().parent.parent / "exemples"
H = A4[1]


def eur(v):
    return f"{v:,.2f}".replace(",", " ").replace(".", ",") + " €"


def devis(nom_fichier, entete, client, meta, lignes, totaux, conditions, pied):
    c = canvas.Canvas(str(SORTIE / nom_fichier), pagesize=A4)
    y = H - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, entete[0])
    c.setFont("Helvetica", 9)
    for l in entete[1:]:
        y -= 13
        c.drawString(40, y, l)
    yc = H - 120
    for l in client:
        c.drawString(330, yc, l)
        yc -= 13
    y = min(y, yc) - 25
    c.setFont("Helvetica-Bold", 12)
    for l in meta:
        c.drawString(40, y, l)
        c.setFont("Helvetica", 10)
        y -= 15
    y -= 10
    c.setFont("Helvetica-Bold", 9)
    for x, t in zip((40, 330, 390, 470), ("Désignation", "Qté", "P.U. HT", "Total HT")):
        c.drawString(x, y, t)
    c.setFont("Helvetica", 9)
    for des, q, pu in lignes:
        y -= 15
        c.drawString(40, y, des)
        c.drawString(330, y, q)
        c.drawRightString(450, y, eur(pu))
        qte = float(q.split()[0].replace(",", "."))
        c.drawRightString(550, y, eur(qte * pu))
    y -= 25
    for lib, val, gras in totaux:
        c.setFont("Helvetica-Bold" if gras else "Helvetica", 10)
        if isinstance(lib, tuple):  # libellés en colonnes, valeurs dessous
            for x, t in zip((300, 390, 470), lib):
                c.drawString(x, y, t)
            y -= 14
            for x, v in zip((370, 450, 550), val):
                c.drawRightString(x, y, eur(v))
        else:
            c.drawString(350, y, lib)
            c.drawRightString(550, y, eur(val))
        y -= 15
    y -= 15
    c.setFont("Helvetica", 9)
    for l in conditions:
        c.drawString(40, y, l)
        y -= 13
    c.setFont("Helvetica", 7)
    c.drawCentredString(A4[0] / 2, 30, pied)
    c.save()


def main():
    SORTIE.mkdir(exist_ok=True)
    client = ["Syndicat des copropriétaires", "Résidence Les Tilleuls (exemple)", "c/o Cabinet Exemple Gestion", "12 rue des Lilas 69003 Lyon"]

    l1 = [("Installation et repli d'échafaudage", "1 ens", 9800.0), ("Nettoyage haute pression façade", "420 m²", 6.5),
          ("Ravalement enduit monocouche", "420 m²", 78.0), ("Protection des balcons et menuiseries", "1 ens", 7470.0)]
    ht1 = sum(float(q.split()[0]) * p for _, q, p in l1)
    devis(
        "devis-facades-martin.pdf",
        ["Façades Martin SARL", "8 avenue Jean Jaurès 69007 Lyon", "Tél. 04 00 00 00 00 - contact@exemple.fr"],
        client,
        ["DEVIS N° D2026-118", "Date : 03/11/2026", "Objet : ravalement de la façade sur rue"],
        l1,
        [("Total HT", ht1, True), ("TVA 10 %", round(ht1 * 0.10, 2), False), ("Total TTC", round(ht1 * 1.10, 2), True)],
        ["Délai d'exécution : 6 semaines à compter de l'ordre de service.", "Devis valable 6 mois.",
         "Acompte de 30 % à la commande, solde à la réception des travaux.",
         "Assurance décennale souscrite auprès de SMABTP, attestation jointe.", "Entreprise qualifiée Qualibat."],
        "Façades Martin SARL au capital de 20 000 € - SIRET 732 829 320 00074 - RCS Lyon",
    )

    l2 = [("Échafaudage de pied", "1 ens", 8200.0), ("Ravalement peinture pliolite", "420 m²", 92.0)]
    ht2 = sum(float(q.split()[0]) * p for _, q, p in l2)
    net2 = round(ht2 * 0.95, 2)
    devis(
        "devis-renov-habitat.pdf",
        ["RÉNOV'HABITAT SAS", "ZI des Peupliers 69800 Saint-Priest"],
        client,
        ["Devis n° 4512 du 15 octobre 2026", "Ravalement façade"],
        l2,
        [("Total HT brut", ht2, False), ("Remise 5 % HT", round(ht2 * 0.05, 2), False),
         (("Total HT net", "TVA 10%", "Total TTC"), (net2, round(net2 * 0.1, 2), round(net2 * 1.1, 2)), True)],
        ["Durée des travaux : 8 semaines.", "Offre valable 90 jours.", "Acompte 40 % à la signature."],
        "Rénov'Habitat SAS - SIRET 552 100 554 00025",
    )

    l3 = [("Échafaudage et filets de protection", "1 ens", 11200.0), ("Traitement des fissures", "60 ml", 55.0),
          ("Ravalement enduit + hydrofuge", "420 m²", 98.0)]
    ht3 = sum(float(q.split()[0]) * p for _, q, p in l3)
    devis(
        "devis-bati-rhone.pdf",
        ["Bâti Rhône Façades SAS", "3 quai Perrache 69002 Lyon", "Qualibat 2111 - RGE"],
        client,
        ["Proposition commerciale - Devis N° BRF-0921", "Lyon, le 8 novembre 2026"],
        l3,
        [("Montant H.T.", ht3, True), ("T.V.A. 10,00 %", round(ht3 * 0.1, 2), False), ("Net à payer T.T.C.", round(ht3 * 1.1, 2), True)],
        ["Délai : 5 semaines.", "Validité de l'offre : 6 mois.", "Acompte de 30 %.",
         "Garantie décennale : AXA France, police n° 0000000."],
        "Bâti Rhône Façades SAS au capital de 50 000 € - SIRET 123 456 789 00007 - TVA FR00123456789",
    )
    print("Exemples générés dans", SORTIE)


if __name__ == "__main__":
    main()

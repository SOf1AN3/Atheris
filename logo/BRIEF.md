# BRIEF — Logo Atheris Labs

**Mode** : Design (fast track) — le brief est tiré de `DESIGN.md` (refonte « Obsidian Instrument »),
pas d'un questionnaire : le document fait foi.

## Ce qu'on fabrique
Un **symbole** (le « A ») qui remplace le glyphe actuel du header (`Header.tsx` / `Footer.tsx` /
`Sidebar.tsx`), plus ses déclinaisons. Il doit tenir à 24 px en barre, à 16 px en favicon,
et fonctionner en une seule couleur.

## Adjectifs de marque (source : DESIGN §2.0)
`OBSIDIEN` · `PRÉCISION` · `SIGNAL`

## Contraintes non négociables
- Palette : obsidien `#06070A`, blanc chaud `#F4F2ED`, **un seul** volt `#CCFF4A` (≤ 5 % de surface).
- Le glyphe est **nu** : pas de cadre, pas de fond (§1.6 a supprimé bordure + bg du monogramme).
- Aucun rebond, aucun dégradé, aucun bleu, aucune icône décorative en volt.
- Le mot-symbole reste `ATHERIS` bold + `LABS` mono (§2.2) : le symbole doit vivre **à côté** de lui.

## Clichés de catégorie écartés
Bleu tech, flèche montante, bouclier, globe, hexagone « tech », crochets `</>`, dégradé violet,
initiale générique en sans géométrique sans détail propre.

## Hypothèses assumées (pas de réponse demandée)
1. Le logo **remplace** le glyphe « A » actuel, il ne le double pas.
2. Aucun clin d'œil au vipère *Atheris* : `DESIGN.md` n'en parle jamais → hors sujet.
3. Mot-symbole : construit en paths dans la phase *kit* (jamais de `<text>` dans un fichier final).
4. Géométrie commune des 3 concepts : pente des jambes **5:2** (dx = 0,4 × dy), base y=224
   (x 56 → 200), sommet (128,44), épaisseur 28, contre-forme (128,114) → 156, traverse 156 → 192.

## Résultat de la ronde 1 — REFUSÉE
`concept-a2-arete-deep` · `concept-b3-filet` · `concept-c-aperture` — direction jugée
trop sage et trop centrée sur le A. Écartée par le client.

## Ronde 2 — demandée : « le signe de code </> dans le A »
Le </> ne peut pas vivre dans la contre-forme (triangle : 54 de large en haut,
le signe fait ≈ 3:1 → impossible). Il est donc **fraisé dans la traverse**, seul
endroit du A aussi large que la lettre. Géométrie calculée par
`logo/build-code-a.py` (chevrons et / en 45° exact) :
`concept-g-traverse` (recommandé) · `concept-e-fraise` · `concept-f-monolithe`
— audits 100/100 — tests : 16-256 px, monochrome, inversé, flou, miroir, étagère.

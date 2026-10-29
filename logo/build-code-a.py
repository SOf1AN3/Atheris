# -*- coding: utf-8 -*-
"""
Générateur des concepts « ATHERIS + </> » — ronde 2.

Le A partagé (grille 256) :
    pente 5:2 → dx = 0,5 x dy · sommet (128,16) · base y=240 (x 16→240)
    épaisseur horizontale des jambes T=40 → intérieurs 56 / 200
    rencontre des intérieurs : y=96 · largeur(y) = y - 16

Pourquoi </> dans la traverse : la contre-forme (triangle) ne fait que
54 de large en haut -> </> (≈ 3:1) n'y tient JAMAIS. La traverse, elle,
occupe toute la largeur de la lettre : c'est le seul endroit du A assez
large pour loger le signe. On fraise donc </> dans la traverse.

V1 « FRAISÉ » : contre-forme conservée + traverse épaisse (62) fraisée.
V2 « MONOLITHE » : pas de contre-forme, corps plein, </> fraisé dedans.
"""
import math

def fmt(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s != "-0" else "0"

def chevron(x0, ym, a, h, t):
    """< dont le sommet est en (x0, ym), bras de longueur a, demi-hauteur h."""
    V, T, B = (x0, ym), (x0 + a, ym - h), (x0 + a, ym + h)
    L = math.hypot(a, h)
    u = (a / L, -h / L)          # bras du haut (vers la droite, vers le haut)
    d = (a / L,  h / L)          # bras du bas
    n1 = (u[1], -u[0])           # normale sortante du bras du haut (haut-gauche)
    n3 = (-d[1], d[0])           # normale sortante du bras du bas (bas-gauche)
    k = 1 + (n1[0] * n3[0] + n1[1] * n3[1])
    m = ((n1[0] + n3[0]) * t / 2 / k, (n1[1] + n3[1]) * t / 2 / k)
    out = [
        (T[0] + n1[0] * t / 2, T[1] + n1[1] * t / 2),
        (V[0] + m[0], V[1] + m[1]),
        (B[0] + n3[0] * t / 2, B[1] + n3[1] * t / 2),
        (B[0] - n3[0] * t / 2, B[1] - n3[1] * t / 2),
        (V[0] - m[0], V[1] - m[1]),
        (T[0] - n1[0] * t / 2, T[1] - n1[1] * t / 2),
    ]
    return out

def slash(xb, yb, xt, yt, t):
    L = math.hypot(xt - xb, yt - yb)
    dx, dy = (xt - xb) / L, (yt - yb) / L
    n = (-dy, dx)
    return [
        (xb + n[0] * t / 2, yb + n[1] * t / 2),
        (xt + n[0] * t / 2, yt + n[1] * t / 2),
        (xt - n[0] * t / 2, yt - n[1] * t / 2),
        (xb - n[0] * t / 2, yb - n[1] * t / 2),
    ]

def mirror(pts, cx=128.0):
    return [(2 * cx - x, y) for (x, y) in reversed(pts)]

def sub(pts):
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + " Z"

def build(counter=True, T=40, counter_base=150, ytop=164, hgt=36, t=11, gap=12,
          name="", title="", note=""):
    """Fraise </> dans la traverse. Bras des chevrons et / en 45° exact.

    A : base y=240 (x 16→240), sommet (128,16), pente 1:2.
        épaisseur horizontale des jambes T → intérieurs 16+T / 240-T
        rencontre des intérieurs y = 16 + 2T
        encoche (notch) : y 212 → 240, intérieurs 30+T / 226-T
    """
    gw = hgt / 2              # bras à 45° : demi-hauteur = course
    sw = hgt                  # / à 45° : course = hauteur
    total = 2 * gw + sw + 2 * gap
    x0 = 128 - total / 2
    ym = ytop + hgt / 2
    inner_l, inner_r = 16 + T, 240 - T
    y_meet = 16 + 2 * T
    notch_l, notch_r = 30 + T, 226 - T
    outer = (f"M16 240 L128 16 L240 240 H{inner_r} L{notch_r} 212 "
             f"H{notch_l} L{inner_l} 240 H16 Z")
    parts = [outer]
    if counter:
        cy_l = inner_l + 0.5 * (240 - counter_base)
        cy_r = inner_r - 0.5 * (240 - counter_base)
        parts.append(f"M128 {y_meet} L{fmt(cy_r)} {counter_base} L{fmt(cy_l)} {counter_base} Z")
    # découpe </> : < à gauche, > = miroir du < (axe x=128), / au centre
    parts.append(sub(chevron(x0, ym, gw, hgt / 2, t)))
    parts.append(sub(mirror(chevron(x0, ym, gw, hgt / 2, t))))
    parts.append(sub(slash(128 - sw / 2, ytop + hgt, 128 + sw / 2, ytop, t)))
    d = " ".join(parts)
    esc = "&lt;/&gt;"          # </> échappé : sinon le XML casse
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Atheris Labs - {title}">
  <title>{note.replace("</>", esc)}</title>
  <!--
    {title}
    A : pente 5:2, sommet (128,16), base y=240 (16→240), jambes T=40,
    intérieurs 56/200, rencontre y=96, largeur(y) = y-16.
    Fraisage </> : hauteur {hgt}, chevrons {gw}, / course {sw}, trait {t}, gouttières {gap}.
    Le tout est UN SEUL path en evenodd : la lettre, sa contre-forme et le
    fraisage sont des trous lus par le fond — donc vrai en une seule couleur.
  -->
  <path fill="#06070A" fill-rule="evenodd" d="{d}"/>
</svg>
'''
    open(name, "w", encoding="utf-8").write(svg)
    print("wrote", name)

# V1 — « FRAISÉ » : jambes épaisses (40), contre-forme serrée, </> dans la traverse
build(counter=True, T=40, counter_base=150, ytop=164, hgt=36, t=11, gap=12,
      name="logo/concept-e-fraise.svg", title="E / Fraisé",
      note="ATHERIS — E / Fraisé (</> fraisé dans la traverse)")

# V2 — « MONOLITHE » : corps plein, pas de contre-forme, fraisage plus grand
build(counter=False, T=40, ytop=154, hgt=40, t=11, gap=12,
      name="logo/concept-f-monolithe.svg", title="F / Monolithe",
      note="ATHERIS — F / Monolithe (</> fraisé dans le corps plein)")

# V3 — « TRAVERSE » : jambes plus fines (30), grande contre-forme, </> plus grand
build(counter=True, T=30, counter_base=140, ytop=152, hgt=48, t=11, gap=14,
      name="logo/concept-g-traverse.svg", title="G / Traverse",
      note="ATHERIS — G / Traverse (</> en traverse du A)")

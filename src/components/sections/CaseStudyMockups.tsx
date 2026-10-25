import type { ReactNode } from "react";

import { Sparkles } from "lucide-react";

import type { MockupKind } from "@/content/types";
import { cn } from "@/lib/utils";

// DESIGN §2.5 — mockups produit 100% CSS, `aria-hidden` + `role="presentation"`.
// Aucune image, aucun `<img>`, aucun texte lisible FR/EN : uniquement des
// barres/blocs de forme + chiffres non traduisibles. Zone `.mock` de hauteur
// FIXE (240px) : chaque mockup tient dans ce cadre. Palette : fond `#0B0E14`,
// lignes `bg-white/10`, blocs `border-line bg-white/[0.03]` — et **au plus UN
// élément volt** par mockup (la donnée mise en avant uniquement, §2.1).
type CaseStudyMockupProps = {
  kind: MockupKind;
};

function MockupFrame({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className="relative h-full w-full overflow-hidden bg-[#0B0E14]"
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. clinic — agenda hebdomadaire d'un cabinet                        */
/* ------------------------------------------------------------------ */

type ClinicSlotKind = "active" | "neutral";

// Colonnes de jours (en-tête = filet) + créneaux. UN seul créneau actif :
// c'est la donnée volt du mockup (le rendez-vous à venir).
const CLINIC_COLUMNS: readonly (readonly ClinicSlotKind[])[] = [
  ["neutral", "neutral", "neutral"],
  ["neutral", "neutral", "neutral", "neutral"],
  ["neutral", "active", "neutral", "neutral", "neutral"],
  ["neutral", "neutral"],
  ["neutral", "neutral", "neutral"],
];

const CLINIC_SLOT_CLASSES: Record<ClinicSlotKind, string> = {
  active: "h-7 rounded-md bg-accent",
  neutral: "h-7 rounded-md border border-line bg-white/[0.03]",
};

function ClinicMockup(): ReactNode {
  return (
    <div className="grid h-full grid-cols-5 gap-1.5 p-3">
      {CLINIC_COLUMNS.map((slots, columnIndex) => (
        <div
          key={`day-${columnIndex}`}
          className={cn(
            "flex flex-col gap-1.5 rounded-md p-1",
            columnIndex === 2 && "bg-white/[0.03]",
          )}
        >
          {/* En-tête de jour : filet, jamais de texte. */}
          <span className="h-2 rounded bg-white/10" />
          {slots.map((slot, slotIndex) => (
            <span
              key={`slot-${columnIndex}-${slotIndex}`}
              className={CLINIC_SLOT_CLASSES[slot]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. papernote — document + panneau de synthèse IA                     */
/* ------------------------------------------------------------------ */

// Lignes de « texte » : largeurs variées pour simuler un document rédigé.
const NOTE_BODY_WIDTHS: readonly string[] = [
  "w-full",
  "w-[94%]",
  "w-[97%]",
  "w-[76%]",
  "w-[91%]",
  "w-[88%]",
  "w-[62%]",
];

const NOTE_SUMMARY_WIDTHS: readonly string[] = ["w-full", "w-[85%]", "w-[72%]"];

function PaperNoteMockup(): ReactNode {
  return (
    <div className="flex h-full">
      {/* Colonne gauche : le document. */}
      <div className="min-w-0 flex-1 space-y-2.5 p-4">
        <span className="block h-3 w-40 rounded bg-white/10" />
        {NOTE_BODY_WIDTHS.map((width, index) => (
          <span
            key={`line-${index}`}
            className={cn("block h-2 rounded bg-white/10", width)}
          />
        ))}
      </div>

      {/* Panneau droit : la synthèse IA (bloc neutre, data volt = le score). */}
      <div className="w-[38%] shrink-0 border-l border-line p-3">
        <div className="rounded-xl border border-line bg-white/[0.03] p-2.5">
          <Sparkles
            aria-hidden="true"
            focusable="false"
            className="size-3.5 text-muted"
            strokeWidth={1.5}
          />
          <div className="mt-2.5 space-y-1.5">
            {NOTE_SUMMARY_WIDTHS.map((width, index) => (
              <span
                key={`summary-${index}`}
                className={cn("block h-1.5 rounded bg-white/10", width)}
              />
            ))}
          </div>
          {/* Chiffre non traduisible (score de synthèse) — LA donnée clé. */}
          <p className="mt-3 text-[10px] font-medium tabular-nums text-accent">
            94 %
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. radio — lecteur audio (waveform + transport)                     */
/* ------------------------------------------------------------------ */

// ~28 barres de waveform, hauteurs variées ; la moitié gauche est en lecture.
const WAVE_HEIGHTS: readonly string[] = [
  "h-4", "h-8", "h-12", "h-6", "h-10", "h-14", "h-9",
  "h-5", "h-11", "h-7", "h-13", "h-8", "h-4", "h-10",
  "h-7", "h-12", "h-6", "h-9", "h-14", "h-5", "h-11",
  "h-8", "h-4", "h-10", "h-6", "h-12", "h-7", "h-5",
];

const WAVE_PLAYED_COUNT = 14;

function RadioMockup(): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-5">
      <div className="flex h-16 items-center gap-1">
        {WAVE_HEIGHTS.map((height, index) => (
          <span
            key={`wave-${index}`}
            className={cn(
              "w-1 rounded-full",
              height,
              index < WAVE_PLAYED_COUNT
                ? "bg-white/[0.22]"
                : "bg-white/[0.08]",
            )}
          />
        ))}
      </div>

      <div className="flex w-[85%] items-center gap-4">
        {/* Transport neutre : le VOLT est réservé à la ligne de lecture. */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white/[0.03]">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 12 14"
            className="ml-0.5 h-3.5 w-3 fill-fg"
          >
            <path d="M0 0l12 7-12 7z" />
          </svg>
        </span>
        {/* Ligne de progression = LA donnée active du mockup (unique volt). */}
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-1/3 rounded-full bg-accent" />
        </span>
        {/* Durée : chiffre non traduisible — autorisé. */}
        <span className="shrink-0 text-[10px] tabular-nums text-muted">
          02:14
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. tiberium — messagerie temps réel                                  */
/* ------------------------------------------------------------------ */

type Conversation = {
  id: string;
  isActive: boolean;
  isOnline: boolean;
  nameWidth: string;
};

const CONVERSATIONS: readonly Conversation[] = [
  { id: "conv-1", isActive: true, isOnline: true, nameWidth: "w-[70%]" },
  { id: "conv-2", isActive: false, isOnline: true, nameWidth: "w-[56%]" },
  { id: "conv-3", isActive: false, isOnline: false, nameWidth: "w-[64%]" },
];

type Bubble = {
  id: string;
  side: "left" | "right";
  width: string;
};

// Alternance gauche (reçues) / droite (envoyées) — toutes en neutre :
// le seul volt du mockup est la conversation active (ci-dessus).
const BUBBLES: readonly Bubble[] = [
  { id: "msg-1", side: "left", width: "w-[70%]" },
  { id: "msg-2", side: "right", width: "w-[54%]" },
  { id: "msg-3", side: "left", width: "w-[46%]" },
  { id: "msg-4", side: "right", width: "w-[62%]" },
];

function TiberiumMockup(): ReactNode {
  return (
    <div className="flex h-full">
      {/* Sidebar des conversations : l'onglet actif = l'unique donnée volt. */}
      <div className="w-[32%] shrink-0 space-y-1.5 border-r border-line p-2">
        {CONVERSATIONS.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "relative flex items-center gap-2 rounded-md p-1.5",
              conversation.isActive
                ? "border border-accent/30 bg-accent/10"
                : "border border-transparent",
            )}
          >
            <span className="relative shrink-0">
              <span className="block size-6 rounded-full bg-white/10" />
              {conversation.isOnline ? (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-success"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span
                className={cn(
                  "block h-2 rounded bg-white/10",
                  conversation.nameWidth,
                )}
              />
              <span className="block h-1.5 w-[80%] rounded bg-white/[0.06]" />
            </span>
          </div>
        ))}
      </div>

      {/* Zone de messages + ligne de saisie. */}
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-2 p-3">
        {BUBBLES.map((bubble) =>
          bubble.side === "left" ? (
            <span
              key={bubble.id}
              className={cn(
                "h-7 max-w-[70%] rounded-2xl rounded-tl-sm bg-white/[0.06]",
                bubble.width,
              )}
            />
          ) : (
            <span
              key={bubble.id}
              className={cn(
                "ml-auto h-7 max-w-[65%] rounded-2xl rounded-tr-sm border border-line bg-white/[0.10]",
                bubble.width,
              )}
            />
          ),
        )}
        <span className="mt-1 h-8 rounded-full border border-line bg-white/[0.03]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Visuel produit 100% CSS d'une étude de cas (§2.5).
 * Rend UNIQUEMENT l'illustration décorative (`aria-hidden`) — le conteneur
 * carte et la zone `.mock` sont portés par `CaseStudyCard`.
 */
export function CaseStudyMockup({ kind }: CaseStudyMockupProps): ReactNode {
  switch (kind) {
    case "clinic":
      return (
        <MockupFrame>
          <ClinicMockup />
        </MockupFrame>
      );
    case "papernote":
      return (
        <MockupFrame>
          <PaperNoteMockup />
        </MockupFrame>
      );
    case "radio":
      return (
        <MockupFrame>
          <RadioMockup />
        </MockupFrame>
      );
    case "tiberium":
      return (
        <MockupFrame>
          <TiberiumMockup />
        </MockupFrame>
      );
  }
}

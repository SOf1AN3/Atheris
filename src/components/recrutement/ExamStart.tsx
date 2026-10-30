"use client";

/**
 * Écran d'accueil du test — le candidat voit qu'il a un examen à passer et
 * dispose de 3 jours pour commencer (D6).
 *
 * Ce composant ne rend PAS le formulaire : il appelle `beginExam`, qui
 * repousse `started_at` à l'instant du clic, puis demande un re-rendu
 * serveur. La bascule d'écran est donc portée par le SERVEUR (il compare
 * `started_at` à `created_at`), jamais par un état local — un candidat qui
 * revient par le lien reçu par email retrouve le bon écran, même depuis un
 * autre appareil.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { beginExam } from "@/actions/exams";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ExamContent } from "@/content/types";

type ExamStartProps = {
  token: string;
  content: ExamContent;
};

/** Titre à deux voix — les marqueurs `*…*` deviennent un accent serif. */
function accentParts(text: string): React.JSX.Element {
  const parts = text.split("*");
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="voix">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function ExamStart({ token, content }: ExamStartProps): React.JSX.Element {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(): Promise<void> {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const result = await beginExam({ token });
      if (result.ok) {
        // Re-rendu serveur : `started_at` a bougé, la page bascule sur le
        // formulaire. Aucun état client à synchroniser.
        router.refresh();
        return;
      }
      // `expired` et `locked` produisent le MÊME message côté client : la
      // page doit se recharger pour afficher l'état dédié, et on ne révèle
      // pas au candidat laquelle des causes a causé l'échec.
      setError(content.errorLabel);
      router.refresh();
    } catch {
      setError(content.errorLabel);
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="flex flex-col items-start gap-5 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-7 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-10">
        <Badge variant="pill">{content.badge}</Badge>

        <h1 className="h-display text-[clamp(1.6rem,3vw,2.1rem)] text-fg">
          {accentParts(content.readyTitle)}
        </h1>

        <p className="max-w-[52ch] text-[15px] leading-[1.7] text-muted">
          {content.readyDescription}
        </p>

        <p className="micro text-faint">{content.validityNote}</p>

        {error !== null ? (
          <p
            role="alert"
            className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button onClick={() => void handleStart()} disabled={starting}>
          {starting ? content.startingLabel : content.startLabel}
        </Button>
      </div>
    </div>
  );
}

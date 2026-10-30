"use client";

/**
 * Atheris — formulaire d'examen zero-interview (Lot 3).
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 * Le barème (`src/lib/exam.ts`) est importé par le CLIENT : source de vérité
 * unique, la même que celle que `saveSection` valide côté serveur. Une question
 * affichée sans être validée, ou l'inverse, est structurellement impossible.
 *
 * ─── AUTOSAUVEGARDE PAR SECTION ─────────────────────────────────────────────
 * Chaque section est persistée à son FRANCHISSEMENT, jamais en fin de parcours.
 * C'est le garde-fou réseau : sur mobile à connection instable, une coupure
 * n'efface rien — seule la section en cours reste à refaire. Une soumission
 * globale en fin de parcours aurait perdu TOUT le candidat à la dernière
 * seconde.
 *
 * ─── CHRONO ─────────────────────────────────────────────────────────────────
 * Indicatif uniquement : il n'est NI affiché au serveur comme contrainte, NI
 * capable de bloquer la soumission. Un candidat lent sur un réseau lent n'est
 * jamais pénalisé — la qualité est jugée par le CEO, pas par une montre.
 *
 * ─── SOUMISSION ─────────────────────────────────────────────────────────────
 * `submitExam` ne reçoit QUE le jeton : les réponses sont relues depuis la base
 * par le serveur. Le client ne peut donc pas faire transiter une réponse que
 * `saveSection` n'aurait pas déjà fait accepter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveSection, submitExam } from "@/actions/exams";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ExamContent } from "@/content/types";
import type { Locale } from "@/i18n/config";
import {
  EXAM_SECTIONS,
  SECTION_TITLES,
  questionsForSection,
  type ExamSection,
} from "@/lib/exam";

type ExamFormProps = {
  token: string;
  locale: Locale;
  content: ExamContent;
};

/** État d'écriture d'une section (affiché sous le bouton). */
type SaveState = "idle" | "saving" | "saved" | "failed";

/** `{{n}}` / `{{total}}` → interpolation simple (aucune dépendance i18n). */
function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(String(value)),
    template,
  );
}

/**
 * Titre à deux voix (DESIGN §2.2.1) : les marqueurs `*…*` du dict séparent la
 * structure (Inter Tight) de l'accent serif (Instrument Serif).
 *
 * Même découpe que `SectionHeading.TitleVoice` — sans elle les astérisques
 * seraient rendus LITTRALEMENT à l'écran (défaut réellement observé sur
 * « Your SDR *assessment* »). Hors de `SectionHeading` car ce composant vit
 * hors du groupe marketing.
 */
function TitleVoice({ text }: { text: string }): React.JSX.Element {
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

export function ExamForm({ token, locale, content }: ExamFormProps): React.JSX.Element {
  const [section, setSection] = useState<ExamSection>(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { failed: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Réf de la section en cours : utilisée par le chrono sans re-créer l'effet.
  const submittedRef = useRef(false);

  // Chrono indicatif (1 s) — jamais bloquant, jamais envoyé au serveur.
  useEffect(() => {
    if (result !== null) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [result]);

  const questions = useMemo(() => questionsForSection(section), [section]);

  const setAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setSaveState("idle");
  }, []);

  /**
   * Persiste la section en cours (appelée au franchissement).
   *
   * Échec NON bloquant : on conserve les réponses en mémoire et on laisse le
   * candidat continuer. Le retry est possible au moment de suivre/soumettre —
   * un coup de réseau ne doit jamais perdre sa saisie ni le bloquer.
   */
  const persistSection = useCallback(
    async (target: ExamSection, overrideAnswers?: Record<string, string>) => {
      const source = overrideAnswers ?? answers;
      const payload: Record<string, string> = {};
      for (const q of questionsForSection(target)) {
        payload[q.id] = (source[q.id] ?? "").trim();
      }

      setSaveState("saving");
      try {
        const res = await saveSection({ token, section: target, answers: payload });
        if (res.ok) {
          setSaveState("saved");
          return true;
        }
        // `invalid` = réponses trop courtes pour le barème : on laisse le
        // candidat corriger, pas de blocage silencieux.
        setSaveState(res.code === "invalid" ? "idle" : "failed");
        return false;
      } catch {
        setSaveState("failed");
        return false;
      }
    },
    [answers, token],
  );

  /** Section suivante : persiste AVANT d'avancer (état à jour en base). */
  const goNext = useCallback(async () => {
    if (section >= EXAM_SECTIONS.length) return;
    await persistSection(section);
    const next = (section + 1) as ExamSection;
    setSection(next);
    setSaveState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [persistSection, section]);

  const goPrevious = useCallback(() => {
    if (section <= 1) return;
    setSection((section - 1) as ExamSection);
    setSaveState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [section]);

  /** Soumission — verrou serveur + décision éliminatoire. */
  const handleSubmit = useCallback(async () => {
    if (submitting || submittedRef.current) return;
    setSubmitting(true);
    setError(null);

    // Dernière section : on persiste d'abord (le serveur recharge la base).
    const persisted = await persistSection(section);
    if (!persisted && saveState === "failed") {
      setSubmitting(false);
      setError(content.saveFailedLabel);
      return;
    }

    try {
      const res = await submitExam({ token });
      if (res.ok) {
        submittedRef.current = true;
        setResult({ failed: res.failed });
        return;
      }
      if (res.code === "incomplete") {
        setError(content.saveFailedLabel);
      } else if (res.code === "locked") {
        // Déjà soumis (double onglet) : état dédié, pas une erreur.
        submittedRef.current = true;
        setResult({ failed: false });
      } else {
        setError(content.errorLabel);
      }
    } catch {
      setError(content.errorLabel);
    } finally {
      setSubmitting(false);
    }
  }, [content, persistSection, saveState, section, submitting, token]);

  // ── Écrans de résultat ────────────────────────────────────────────────────
  if (result !== null) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <div className="flex flex-col items-center gap-5 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-7 text-center shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-10">
          <Badge variant="pill">{content.badge}</Badge>
          <h1 className="h-display text-[clamp(1.6rem,3vw,2.1rem)] text-fg">
            <TitleVoice text={result.failed ? content.failedTitle : content.successTitle} />
          </h1>
          <p className="max-w-[52ch] text-[15px] leading-[1.7] text-muted">
            {result.failed ? content.failedMessage : content.successMessage}
          </p>
          {!result.failed ? (
            <p className="micro border-t border-line pt-4 text-faint">{content.reviewNote}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const isLast = section >= EXAM_SECTIONS.length;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-6">
      {/* ── En-tête : badge + progression + chrono indicatif ─────────────── */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="pill">{content.badge}</Badge>
          <span className="micro tabular-nums text-faint">
            ⏱ {minutes}:{seconds}
          </span>
        </div>
        <h1 className="h-display text-[clamp(1.6rem,3vw,2.1rem)] text-fg">
          <TitleVoice text={content.title} />
        </h1>
        <p className="max-w-[62ch] text-[15px] leading-[1.65] text-muted">{content.description}</p>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <span className="micro text-accent">
            {interpolate(content.progressLabel, { n: section, total: EXAM_SECTIONS.length })}
          </span>
          <span className="micro text-faint">· {content.durationNote}</span>
        </div>
        <p className="micro text-faint">{content.autosaveNote}</p>
      </header>

      {/* ── Barre de progression (filet volt unique de la page) ───────────── */}
      <div className="h-px w-full bg-line">
        <div
          className="h-px bg-accent transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${(section / EXAM_SECTIONS.length) * 100}%` }}
        />
      </div>

      {/* ── Titre de section ─────────────────────────────────────────────── */}
      <section aria-labelledby={`section-${section}`}>
        <div className="flex items-center gap-4">
          <span className="micro text-accent">
            {String(section).padStart(2, "0")}
          </span>
          <span className="micro text-faint">— {SECTION_TITLES[section][locale]}</span>
          <span aria-hidden="true" className="h-px min-w-8 flex-1 bg-line-2" />
        </div>

        <h2
          id={`section-${section}`}
          className="h-display mt-4 text-[clamp(1.25rem,2.4vw,1.6rem)] text-fg"
        >
          {SECTION_TITLES[section][locale]}
        </h2>

        <div className="mt-6 flex flex-col gap-6">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className="rounded-[20px] border border-line border-t-line-2 bg-surface p-5 md:p-6"
            >
              <span aria-hidden="true" className="micro block text-faint">
                {String(index + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}
              </span>

              <label
                htmlFor={question.id}
                className="mt-3 block text-[15px] font-semibold leading-[1.5] text-fg"
              >
                {question.prompt[locale]}
              </label>

              {question.hint ? (
                <p className="mt-1.5 text-[13px] text-faint">{question.hint[locale]}</p>
              ) : null}

              {question.kind === "textarea" ? (
                <textarea
                  id={question.id}
                  rows={5}
                  value={answers[question.id] ?? ""}
                  onChange={(event) => setAnswer(question.id, event.target.value)}
                  maxLength={question.maxLength}
                  className="mt-3 w-full rounded-xl border border-line-2 bg-ink-2 px-4 py-3 text-[15px] leading-[1.6] text-fg outline-none transition-colors duration-150 focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
                />
              ) : (
                <fieldset className="mt-3">
                  <legend className="sr-only">{question.prompt[locale]}</legend>
                  <div className="flex flex-col gap-2">
                    {question.options?.map((option) => {
                      const checked = answers[question.id] === option.id;
                      return (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-[14px] leading-[1.55] transition-colors duration-150 ${
                            checked
                              ? "border-accent bg-[rgba(204,255,74,0.06)] text-fg"
                              : "border-line-2 text-muted hover:border-line-3"
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={option.id}
                            checked={checked}
                            onChange={() => setAnswer(question.id, option.id)}
                            className="mt-1 size-4 shrink-0 accent-[#CCFF4A]"
                          />
                          <span>
                            {option.label[locale]}
                            {option.recommended && !checked ? (
                              <span className="micro mt-1 block text-faint">
                                ✓ {locale === "fr" ? "réponse attendue" : "expected answer"}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Erreur + état d'autosauvegarde ────────────────────────────────── */}
      {error !== null ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="micro text-faint" aria-live="polite">
          {saveState === "saving"
            ? content.savingLabel
            : saveState === "saved"
              ? `✓ ${content.savedLabel}`
              : saveState === "failed"
                ? content.saveFailedLabel
                : ""}
        </span>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={goPrevious} disabled={section <= 1}>
            ← {content.previousSectionLabel}
          </Button>

          {isLast ? (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? content.submittingLabel : content.submitLabel}
            </Button>
          ) : (
            <Button onClick={goNext}>
              {content.nextSectionLabel} →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

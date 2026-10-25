"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { login } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginErrorsContent } from "@/content/platform/types";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Formulaire de connexion (T09) — « use client » car il consomme la Server
 * Action `login()` de `src/actions/auth.ts` (contrat FIGÉ : entrée typée
 * `{ email, password, ip? }`, retour `LoginResult` = union discriminé `ok`).
 *
 * i18n : toutes les strings viennent du dictionnaire plateforme, injectées
 * depuis la page serveur via des props **sérialisables** (les fonctions du
 * dict, ex. `validation.tooShort`, sont résolues côté serveur — une fonction
 * ne peut pas traverser la frontière server → client).
 *
 * Validation : Zod côté client, **mêmes règles que `login()`** pour l'email
 * (trim + minuscules + `z.email()`) + mot de passe min. 8 caractères.
 * `noValidate` sur le `<form>` désactive la validation native du navigateur.
 *
 * DESIGN §3.6 : carte « console » (rayon 20px, arête lumineuse `border-t-white/
 * [0.18]`, profondeur) — label 13px/600 `fg-2` toujours visible au-dessus
 * (mb 8px), champ 52px thématisé, erreur = bordure `danger` + message 13px
 * `text-danger` sous le champ avec icône `AlertCircle` 14px, relié par
 * `aria-describedby`. CTA unique aplat volt + `sweep` (brillance M13).
 */

/** Libellés statiques du formulaire (copie sérialisable de `auth.login`). */
export type LoginFormLabels = {
  emailLabel: string;
  passwordLabel: string;
  submit: string;
  submitLoading: string;
  forgotNote: string;
  signupLink: string;
};

/** Messages i18n du formulaire (copie sérialisable, résolue côté serveur). */
export type LoginFormMessages = {
  /** `auth.validation.emailInvalid` */
  emailInvalid: string;
  /** `auth.validation.required` */
  required: string;
  /** `auth.validation.tooShort(8)` — minimum 8 caractères du mot de passe. */
  passwordTooShort: string;
  /** `auth.login.errors` : les 4 codes d'échec + repli `generic`. */
  errors: LoginErrorsContent;
};

type LoginFormProps = {
  locale: Locale;
  labels: LoginFormLabels;
  messages: LoginFormMessages;
};

/**
 * Schéme de connexion, construit à partir des messages i18n injectés.
 * Email : identique au schéme serveur `loginInputSchema` (`src/actions/auth.ts`).
 */
function createLoginSchema(messages: LoginFormMessages) {
  return z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, messages.required)
      .pipe(z.email(messages.emailInvalid)),
    password: z
      .string()
      .min(1, messages.required)
      .min(8, messages.passwordTooShort),
  });
}

type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;

/**
 * Résout la destination post-connexion en toute sécurité (anti open-redirect) :
 * seul un chemin **relatif** est accepté — `//host` et `/\host` (normalisé en
 * `//host` par certains agents) sont rejetés → repli sur `/{locale}/espace`,
 * page qui se re-dirige elle-même vers la home du rôle connecté.
 */
function resolvePostLoginPath(callbackUrl: string | null, locale: Locale): string {
  const isSafeInternalPath =
    callbackUrl !== null &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//") &&
    !callbackUrl.startsWith("/\\");
  return isSafeInternalPath ? callbackUrl : `/${locale}/espace`;
}

export function LoginForm({ locale, labels, messages }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [serverError, setServerError] = useState<string | null>(null);
  // État explicite (plutôt que `formState.isSubmitting`) pour rester bloqué
  // sur « submitting » pendant la redirection, sans retour accidentel à idle.
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(createLoginSchema(messages)),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setIsSubmitting(true);
    // GARDE-FOU PROD : si la Server Action ne répond jamais (500 d'infra,
    // réseau coupé, timeout), on ne reste pas bloqué sur « submitting » à vie.
    // 20 s largement au-delà d'un login normal (~1-2 s).
    let settled = false;
    const guard = setTimeout(() => {
      if (!settled) {
        setServerError(messages.errors.generic);
        setIsSubmitting(false);
      }
    }, 20000);
    try {
      const result = await login(values);
      settled = true;
      if (result.ok) {
        const target = resolvePostLoginPath(
          searchParams.get("callbackUrl"),
          locale,
        );
        router.push(target);
        router.refresh();
        clearTimeout(guard);
        return; // reste en état « submitting » jusqu'à la navigation
      }
      clearTimeout(guard);
      setServerError(messages.errors[result.code]);
      setIsSubmitting(false);
    } catch {
      // Server Action rethrow d'une erreur d'infrastructure (DB, réseau…) :
      // aucun détail interne n'est fuité, repli sur le message générique.
      settled = true;
      clearTimeout(guard);
      setServerError(messages.errors.generic);
      setIsSubmitting(false);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={isSubmitting}
      className={cn(
        /* DESIGN §2.4/§2.6 — carte « console » : arête lumineuse en bord
           supérieur + profondeur. Rayon carte (20px) = contenu, jamais pill. */
        "mt-8 flex flex-col gap-5 rounded-[20px] border border-line-2 border-t-white/[0.18] bg-surface p-6 shadow-[0_50px_90px_-60px_rgba(0,0,0,0.9)] md:p-9",
      )}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email" className="text-fg-2">
          {labels.emailLabel}
        </Label>
        <Input
          {...register("email")}
          id="login-email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isSubmitting}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          className="aria-invalid:border-danger"
        />
        {errors.email ? (
          <p
            id="login-email-error"
            className="flex items-center gap-1.5 text-[13px] leading-snug text-danger"
          >
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password" className="text-fg-2">
          {labels.passwordLabel}
        </Label>
        <Input
          {...register("password")}
          id="login-password"
          type="password"
          autoComplete="current-password"
          disabled={isSubmitting}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          className="aria-invalid:border-danger"
        />
        {errors.password ? (
          <p
            id="login-password-error"
            className="flex items-center gap-1.5 text-[13px] leading-snug text-danger"
          >
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isSubmitting}
        className={cn(
          /* SEUL aplat volt de l'écran : `sweep` = balayée de brillance (M13).
             Libellé/spinner pilotés ci-dessus, seul l'habillage change ici. */
          "w-full sweep disabled:opacity-60",
          isSubmitting && "cursor-wait",
        )}
      >
        {isSubmitting ? labels.submitLoading : labels.submit}
      </Button>

      {serverError !== null ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] leading-snug text-danger"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span>{serverError}</span>
        </div>
      ) : null}

      <p className="text-center text-[13px] leading-snug text-muted">
        {labels.forgotNote}
      </p>

      <Button
        variant="ghost"
        size="sm"
        href={`/${locale}/inscription`}
        className="self-center text-muted underline decoration-line-2 underline-offset-4 hover:text-fg"
      >
        {labels.signupLink}
      </Button>
    </form>
  );
}

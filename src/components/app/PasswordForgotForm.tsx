"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestPasswordReset } from "@/actions/password-reset";
import { Button } from "@/components/ui/Button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";

// ---------------------------------------------------------------------------
// Props (sérialisables : résolues côté serveur, page
// `/{locale}/mot-de-passe-oublie` — le dictionnaire complet contient des
// fonctions, impossible à transmettre à un Client Component).
// ---------------------------------------------------------------------------

/** Sous-ensemble de messages i18n requis, tous en chaînes. */
export type PasswordForgotFormLabels = {
  emailLabel: string;
  submit: string;
  submitLoading: string;
  /** Message après soumission — réponse TOUJOURS générique (anti-énumération). */
  success: string;
  /** Lien de CTA après succès → `/{locale}/connexion` (libellé `login.submit`). */
  signIn: string;
  required: string;
  emailInvalid: string;
  /** Repli réseau/500 → `login.errors.generic` (aucun détail fuité). */
  errorGeneric: string;
};

type PasswordForgotFormProps = {
  locale: Locale;
  labels: PasswordForgotFormLabels;
};

// ---------------------------------------------------------------------------
// Schéma Zod v4 (validation client) — miroir du schéma serveur
// `requestResetSchema` (`src/actions/password-reset.ts`) : trim + minuscules
// avant validation de format. Le serveur revalide intégralement.
// ---------------------------------------------------------------------------

function createForgotSchema(labels: PasswordForgotFormLabels) {
  return z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, labels.required)
      .pipe(z.email(labels.emailInvalid)),
  });
}

type PasswordForgotFormValues = z.infer<ReturnType<typeof createForgotSchema>>;

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function PasswordForgotForm({
  locale,
  labels,
}: PasswordForgotFormProps): ReactNode {
  const [submitted, setSubmitted] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);

  const form = useForm<PasswordForgotFormValues>({
    resolver: zodResolver(createForgotSchema(labels)),
    mode: "onTouched",
    defaultValues: { email: "" },
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: PasswordForgotFormValues): Promise<void> => {
    setGenericError(null);
    try {
      // Réponse TOUJOURS `{ ok: true }` côté serveur (C4) : le message
      // de succès est donc affiché quelle que soit l'existence du compte.
      await requestPasswordReset({ email: values.email, locale });
      setSubmitted(true);
    } catch {
      // Échec réseau / 500 d'infra : aucun détail sur le compte — message
      // générique uniquement (l'anti-énumération ne s'applique pas au réseau
      // du visiteur, qui ne révèle rien).
      setGenericError(labels.errorGeneric);
    }
  };

  // Succès : bloc de confirmation générique + CTA de connexion.
  if (submitted) {
    return (
      <div role="status" className="flex flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.10)]"
        >
          <svg viewBox="0 0 24 24" className="size-6 text-success" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-[15px] leading-relaxed text-muted">{labels.success}</p>
        <Button href={`/${locale}/connexion`} size="sm">
          {labels.signIn}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className={`flex flex-col gap-4 text-left transition-opacity duration-150 ${
          isSubmitting ? "opacity-70" : ""
        }`}
      >
        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.emailLabel}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {genericError !== null ? (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-danger">
            {genericError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? labels.submitLoading : labels.submit}
        </Button>
      </form>
    </Form>
  );
}

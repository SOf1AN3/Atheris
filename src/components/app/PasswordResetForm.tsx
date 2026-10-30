"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { resetPassword } from "@/actions/password-reset";
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
// `/{locale}/reinitialisation?token=…`).
// ---------------------------------------------------------------------------

/** Sous-ensemble de messages i18n requis, tous en chaînes. */
export type PasswordResetFormLabels = {
  passwordLabel: string;
  passwordConfirmLabel: string;
  submit: string;
  submitLoading: string;
  successTitle: string;
  successBody: string;
  /** Lien de CTA après succès → `/{locale}/connexion` (libellé `login.submit`). */
  signIn: string;
  /** Jeton expiré/invalide → `auth.passwordReset.reset.invalidToken` (C4 :
   *  un SEUL message, jamais distingué « expiré » vs « signature fausse »). */
  invalidToken: string;
  /** Repli pour tout code inattendu + erreur réseau → `login.errors.generic`. */
  errorGeneric: string;
  /** `AUTH_SECRET` absent côté serveur → `login.errors.config`. */
  errorService: string;
  required: string;
  passwordTooShort: string;
  passwordTooLong: string;
  passwordMismatch: string;
  /** Libellé du lien de repli après échec → `/{locale}/mot-de-passe-oublie`. */
  requestNewLink: string;
};

type PasswordResetFormProps = {
  /** Jeton signé lu dans l'URL — jamais un champ éditable. */
  token: string;
  locale: Locale;
  labels: PasswordResetFormLabels;
};

// ---------------------------------------------------------------------------
// Schéma Zod v4 (validation client) — miroir des planchers du schéma serveur
// `resetPasswordSchema` (`password` 8..256, mêmes règles que la connexion).
// Le serveur revalide intégralement : un bypass via la console ne passe pas.
// ---------------------------------------------------------------------------

function createResetSchema(labels: PasswordResetFormLabels) {
  return z
    .object({
      password: z
        .string()
        .min(1, labels.required)
        .min(8, labels.passwordTooShort)
        .max(256, labels.passwordTooLong),
      passwordConfirm: z.string().min(1, labels.required),
    })
    .refine((values) => values.passwordConfirm === values.password, {
      path: ["passwordConfirm"],
      error: labels.passwordMismatch,
    });
}

type PasswordResetFormValues = z.infer<ReturnType<typeof createResetSchema>>;

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function PasswordResetForm({
  token,
  locale,
  labels,
}: PasswordResetFormProps): ReactNode {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Lien expiré/invalide : on propose explicitement d'en demander un nouveau.
  const [tokenRejected, setTokenRejected] = useState(false);

  const form = useForm<PasswordResetFormValues>({
    resolver: zodResolver(createResetSchema(labels)),
    mode: "onTouched",
    defaultValues: { password: "", passwordConfirm: "" },
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: PasswordResetFormValues): Promise<void> => {
    setServerError(null);
    setTokenRejected(false);
    try {
      const result = await resetPassword({
        token,
        password: values.password,
      });

      if (result.ok) {
        setSubmitted(true);
        return;
      }

      switch (result.code) {
        case "invalid":
          setServerError(labels.invalidToken);
          setTokenRejected(true);
          return;
        case "config":
          setServerError(labels.errorService);
          return;
        default:
          setServerError(labels.errorGeneric);
      }
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique.
      setServerError(labels.errorGeneric);
    }
  };

  // Succès : le formulaire est remplacé par un bloc de confirmation + CTA de
  // connexion (la réinitialisation n'ouvre pas de session).
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
        <h2 className="text-lg font-semibold tracking-[-0.015em] text-fg">
          {labels.successTitle}
        </h2>
        <p className="text-[15px] leading-relaxed text-muted">
          {labels.successBody}
        </p>
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
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.passwordLabel}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.passwordConfirmLabel}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError !== null ? (
          <div className="flex flex-col gap-2">
            <p
              role="alert"
              className="flex items-start gap-1.5 text-[13px] font-medium text-danger"
            >
              {serverError}
            </p>
            {tokenRejected ? (
              /* Lien de repli : demander un nouveau lien (l'ancien est mort,
                 l'action le rejettera toujours de la même façon). */
              <Link
                href={`/${locale}/mot-de-passe-oublie`}
                className="text-[13px] font-medium text-muted underline underline-offset-4 transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
              >
                {labels.requestNewLink}
              </Link>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? labels.submitLoading : labels.submit}
        </Button>
      </form>
    </Form>
  );
}

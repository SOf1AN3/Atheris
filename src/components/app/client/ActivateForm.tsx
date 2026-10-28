"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { activateAccount } from "@/actions/invitations";
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
// Props (sérialisables : le dictionnaire complet contient des FONCTIONS —
// `validation.tooShort/tooLong` — impossibles à passer à un Client Component ;
// les libellés sont donc résolus côté serveur, page `/invitation/[token]`).
// ---------------------------------------------------------------------------

/** Sous-ensemble de messages i18n requis, tous en chaînes. */
export type ActivateFormLabels = {
  nameLabel: string;
  passwordLabel: string;
  passwordConfirmLabel: string;
  submit: string;
  loading: string;
  successTitle: string;
  successBody: string;
  /** Lien de CTA après succès → `/{locale}/connexion` (libellé `login.submit`). */
  signIn: string;
  /** Jeton inconnu ou malformé → `auth.invitation.invalid`. */
  errorInvalid: string;
  /** Jeton expiré → `auth.invitation.expired`. */
  errorExpired: string;
  /** Jeton déjà consommé → `auth.invitation.used`. */
  errorUsed: string;
  /** Email déjà pourvu d'un compte → `auth.invitation.duplicate`. */
  errorDuplicate: string;
  /** Repli pour tout code inattendu + erreur réseau → `login.errors.generic`. */
  errorGeneric: string;
  required: string;
  nameTooShort: string;
  nameTooLong: string;
  passwordTooShort: string;
  passwordTooLong: string;
  passwordMismatch: string;
};

type ActivateFormProps = {
  /** Jeton d'invitation (64 car. hex) lu dans l'URL — jamais un champ éditable. */
  token: string;
  locale: Locale;
  labels: ActivateFormLabels;
};

// ---------------------------------------------------------------------------
// Schéma Zod v4 (validation client) — miroir des planchers du schéma figé
// `activateInvitationInputSchema` (`name` 2..120, `password` 8..256). Le
// serveur revalide intégralement : un bypass via la console ne passe pas.
// ---------------------------------------------------------------------------

function createActivateSchema(labels: ActivateFormLabels) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, labels.nameTooShort)
        .max(120, labels.nameTooLong),
      password: z
        .string()
        .min(8, labels.passwordTooShort)
        .max(256, labels.passwordTooLong),
      passwordConfirm: z.string().min(1, labels.required),
    })
    .refine((values) => values.passwordConfirm === values.password, {
      path: ["passwordConfirm"],
      error: labels.passwordMismatch,
    });
}

type ActivateFormValues = z.infer<ReturnType<typeof createActivateSchema>>;

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function ActivateForm({
  token,
  locale,
  labels,
}: ActivateFormProps): ReactNode {
  const [submitted, setSubmitted] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);

  const form = useForm<ActivateFormValues>({
    resolver: zodResolver(createActivateSchema(labels)),
    mode: "onTouched",
    defaultValues: {
      name: "",
      password: "",
      passwordConfirm: "",
    },
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: ActivateFormValues): Promise<void> => {
    setGenericError(null);

    try {
      const result = await activateAccount({
        token,
        name: values.name,
        password: values.password,
      });

      if (result.ok) {
        setSubmitted(true);
        return;
      }

      switch (result.code) {
        case "invalid":
          setGenericError(labels.errorInvalid);
          return;
        case "expired":
          setGenericError(labels.errorExpired);
          return;
        case "used":
          setGenericError(labels.errorUsed);
          return;
        case "duplicate":
          setGenericError(labels.errorDuplicate);
          return;
        default:
          setGenericError(labels.errorGeneric);
      }
    } catch {
      // Erreur d'infra (action propagée en 500) : message générique.
      setGenericError(labels.errorGeneric);
    }
  };

  // Succès : le formulaire est remplacé par un bloc de confirmation + CTA de
  // connexion (l'activation ne connecte pas la session : `/connexion` sépare
  // les deux étapes, aucune session n'est ouverte ici).
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.nameLabel}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

        {genericError !== null ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-[13px] font-medium text-destructive"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 size-3.5 shrink-0"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M12 7.5v5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 16.25h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            {genericError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? labels.loading : labels.submit}
        </Button>
      </form>
    </Form>
  );
}

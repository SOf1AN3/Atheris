"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { applyAsCandidate } from "@/actions/profile";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import type { SignupContent } from "@/content/platform/types";

// ---------------------------------------------------------------------------
// Props (sérialisables : le dictionnaire complet contient des FONCTIONS —
// `validation.tooShort/tooLong` — impossibles à passer à un composant client).
// ---------------------------------------------------------------------------

/** Sous-ensemble de messages i18n requis, tous en chaînes (sérialisables). */
export type CandidateFormErrors = {
  emailInvalid: string;
  phoneInvalid: string;
  required: string;
  passwordMismatch: string;
  passwordWeak: string;
  nameTooShort: string;
  nameTooLong: string;
  passwordTooShort: string;
  generic: string;
};

type CandidateFormProps = {
  locale: Locale;
  signup: SignupContent;
  errors: CandidateFormErrors;
  loading: string;
};

// ---------------------------------------------------------------------------
// Schéma Zod v4 (validation client). Les règles de mot de passe affichées
// (`signup.passwordRules` = « 12 caractères minimum, une majuscule, un chiffre
// et un caractère spécial ») sont ENFORCÉES côté client pour rester honnête
// avec l'utilisateur ; le serveur applique un plancher plus souple (`min 8`,
// contrat C-5) qui ne sera jamais atteint par un formulaire valide.
// ---------------------------------------------------------------------------

function createSignupSchema(errors: CandidateFormErrors) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, errors.nameTooShort)
        .max(120, errors.nameTooLong),
      email: z
        .string()
        .trim()
        .min(1, errors.required)
        .pipe(z.email({ error: errors.emailInvalid })),
      phone: z.string().trim().min(6, errors.phoneInvalid),
      password: z
        .string()
        .min(12, errors.passwordTooShort)
        .refine(
          (value) =>
            /[A-Z]/.test(value) &&
            /\d/.test(value) &&
            /[^A-Za-z0-9]/.test(value),
          { error: errors.passwordWeak },
        ),
      passwordConfirm: z.string().min(1, errors.required),
      consent: z.boolean().refine((value) => value === true, {
        error: errors.required,
      }),
      companyWebsite: z.string().optional(),
    })
    .refine((values) => values.passwordConfirm === values.password, {
      path: ["passwordConfirm"],
      error: errors.passwordMismatch,
    });
}

type CandidateFormValues = z.infer<ReturnType<typeof createSignupSchema>>;

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

export function CandidateForm({
  locale,
  signup,
  errors,
  loading,
}: CandidateFormProps): ReactNode {
  const [submitted, setSubmitted] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);

  const form = useForm<CandidateFormValues>({
    resolver: zodResolver(createSignupSchema(errors)),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      passwordConfirm: "",
      consent: false,
      companyWebsite: "",
    },
  });

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: CandidateFormValues): Promise<void> => {
    setGenericError(null);

    const result = await applyAsCandidate({
      name: values.name,
      email: values.email,
      phone: values.phone,
      password: values.password,
      companyWebsite: values.companyWebsite ?? "",
    });

    if (result.ok) {
      setSubmitted(true);
      return;
    }

    if (result.code === "duplicate") {
      setError("email", { message: signup.duplicateEmail });
      return;
    }

    setGenericError(errors.generic);
  };

  // Succès : le formulaire est remplacé par un bloc de confirmation (aucune
  // dépendance d'animation — l'état React suffit). Honnêteté : aucun email
  // n'est envoyé en v1, la validation est manuelle par un administrateur.
  if (submitted) {
    return (
      <div role="status" className="flex flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.10)]"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6 text-success"
            fill="none"
          >
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
          {signup.successTitle}
        </h2>
        <p className="text-[15px] leading-relaxed text-muted">
          {signup.successBody}
        </p>
        <Link
          href={`/${locale}/connexion`}
          className="text-[13px] font-semibold text-accent underline-offset-4 hover:underline"
        >
          {signup.alreadyHaveAccount}
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-4 text-left"
      >
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{signup.nameLabel}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{signup.emailLabel}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{signup.phoneLabel}</FormLabel>
              <FormControl>
                <Input type="tel" autoComplete="tel" {...field} />
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
              <FormLabel>{signup.passwordLabel}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription className="text-[13px] text-muted">
                {signup.passwordRules}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="passwordConfirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{signup.passwordConfirmLabel}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="consent"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0">
              <FormControl className="mt-0.5">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-2">
                <FormLabel className="font-normal leading-snug text-muted">
                  {signup.consentLabel}
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        {/* SECURITY: honeypot (DESIGN §3.6) — hors flux visuel (absolute
            off-screen), non focalisable au clavier, ignoré des lecteurs
            d'écran. Un bot qui le remplit reçoit un faux succès côté serveur,
            sans aucune insertion en base. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
          {...register("companyWebsite")}
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
          {isSubmitting ? loading : signup.submit}
        </Button>
      </form>
    </Form>
  );
}

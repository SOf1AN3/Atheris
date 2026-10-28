"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { ProfileContent } from "@/content/platform/types";

// ---------------------------------------------------------------------------
// Props (sérialisables — le dictionnaire complet contient des fonCTIONS :
// `validation.tooShort/tooLong` — impossibles à transmettre au client).
// ---------------------------------------------------------------------------

/** Messages i18n requis, tous en chaînes (sérialisables vers le client). */
export type ProfileFormsErrors = {
  emailInvalid: string;
  phoneInvalid: string;
  required: string;
  passwordMismatch: string;
  passwordWeak: string;
  passwordTooShort: string;
  duplicateEmail: string;
  wrongPassword: string;
  generic: string;
};

type ProfileFormsProps = {
  /** Email courant (issu de la session) pour pré-remplir le champ. */
  defaultEmail: string;
  profile: ProfileContent;
  errors: ProfileFormsErrors;
  /** Règles du mot de passe (réutilise `auth.signup.passwordRules`). */
  passwordRules: string;
  loading: string;
};

// ---------------------------------------------------------------------------
// Fabriques de schémas Zod v4 (un par bloc, messages fournis en prop).
// ---------------------------------------------------------------------------

function createEmailFormSchema(errors: ProfileFormsErrors) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, errors.required)
      .pipe(z.email({ error: errors.emailInvalid })),
    currentPassword: z.string().min(1, errors.required).max(256),
  });
}
type EmailFormValues = z.infer<ReturnType<typeof createEmailFormSchema>>;

function createPhoneFormSchema(errors: ProfileFormsErrors) {
  return z.object({
    phone: z.string().trim().min(6, errors.phoneInvalid),
  });
}
type PhoneFormValues = z.infer<ReturnType<typeof createPhoneFormSchema>>;

function createPasswordFormSchema(errors: ProfileFormsErrors) {
  return z
    .object({
      currentPassword: z.string().min(1, errors.required).max(256),
      newPassword: z
        .string()
        .min(12, errors.passwordTooShort)
        .refine(
          (value) =>
            /[A-Z]/.test(value) &&
            /\d/.test(value) &&
            /[^A-Za-z0-9]/.test(value),
          { error: errors.passwordWeak },
        ),
      confirmPassword: z.string().min(1, errors.required),
    })
    .refine((values) => values.confirmPassword === values.newPassword, {
      path: ["confirmPassword"],
      error: errors.passwordMismatch,
    });
}
type PasswordFormValues = z.infer<ReturnType<typeof createPasswordFormSchema>>;

// ---------------------------------------------------------------------------
// Composant.
// ---------------------------------------------------------------------------

/**
 * Formulaires de profil unifiés (T13) : 3 cartes indépendantes (email,
 * téléphone, mot de passe), chacune avec son propre `useForm` + validation
 * Zod et son bouton de sauvegarde. Le nom n'est PAS éditable (affiché en
 * lecture seule par la page serveur).
 *
 * Décisions UX documentées :
 * - **Email** : un « mot de passe actuel » est requis (transmis comme
 *   `currentPassword`) pour valider le changement d'email.
 * - **Téléphone** : champ seul, sans mot de passe (simple, assumé en v1).
 *   La valeur actuelle n'est pas pré-remplie (absente du JWT de session) ;
 *   saisir un numéro ≥ 6 caractères pour le changer.
 * - **Mot de passe** : actuel + nouveau + confirmation (mêmes règles que
 *   l'inscription : 12 car. min, majuscule, chiffre, caractère spécial).
 * - Succès → toast `sonner` ; `router.refresh()` après email/mot de passe
 *   pour recharger la session (l'email du topbar peut avoir changé).
 *
 * Aucune clé i18n n'existe pour les descriptions des cartes email/téléphone
 * (`profile.*` est verrouillé) : volontairement omises plutôt que codées en
 * dur (évite du texte non traduit en EN).
 */
export function ProfileForms({
  defaultEmail,
  profile,
  errors,
  passwordRules,
  loading,
}: ProfileFormsProps): ReactNode {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(createEmailFormSchema(errors)),
    mode: "onTouched",
    defaultValues: { email: defaultEmail, currentPassword: "" },
  });

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(createPhoneFormSchema(errors)),
    mode: "onTouched",
    defaultValues: { phone: "" },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(createPasswordFormSchema(errors)),
    mode: "onTouched",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onEmailSubmit = async (values: EmailFormValues): Promise<void> => {
    setBanner(null);
    const result = await updateProfile({
      email: values.email,
      currentPassword: values.currentPassword,
    });
    if (result.ok) {
      toast.success(profile.emailSaved);
      router.refresh();
      return;
    }
    if (result.code === "duplicate") {
      emailForm.setError("email", { message: errors.duplicateEmail });
      return;
    }
    if (result.code === "wrong_password") {
      emailForm.setError("currentPassword", { message: errors.wrongPassword });
      return;
    }
    setBanner(errors.generic);
  };

  const onPhoneSubmit = async (values: PhoneFormValues): Promise<void> => {
    setBanner(null);
    const result = await updateProfile({ phone: values.phone });
    if (result.ok) {
      toast.success(profile.phoneSaved);
      return;
    }
    setBanner(errors.generic);
  };

  const onPasswordSubmit = async (
    values: PasswordFormValues,
  ): Promise<void> => {
    setBanner(null);
    const result = await updateProfile({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (result.ok) {
      toast.success(profile.passwordSaved);
      passwordForm.reset();
      router.refresh();
      return;
    }
    if (result.code === "wrong_password") {
      passwordForm.setError("currentPassword", {
        message: errors.wrongPassword,
      });
      return;
    }
    setBanner(errors.generic);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {banner !== null ? (
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
          {banner}
        </p>
      ) : null}

      {/* Carte Email. */}
      <Card className="rounded-xl border-line bg-surface">
        <CardHeader>
          <CardTitle>{profile.email}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit(onEmailSubmit)}
              noValidate
              className="flex flex-col gap-4"
            >
              <FormField
                control={emailForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.email}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.currentPassword}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting
                  ? loading
                  : profile.saveEmail}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Carte Téléphone. */}
      <Card className="rounded-xl border-line bg-surface">
        <CardHeader>
          <CardTitle>{profile.phone}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...phoneForm}>
            <form
              onSubmit={phoneForm.handleSubmit(onPhoneSubmit)}
              noValidate
              className="flex flex-col gap-4"
            >
              <FormField
                control={phoneForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.phone}</FormLabel>
                    <FormControl>
                      <Input type="tel" autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={phoneForm.formState.isSubmitting}
              >
                {phoneForm.formState.isSubmitting
                  ? loading
                  : profile.savePhone}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Carte Mot de passe. */}
      <Card className="rounded-xl border-line bg-surface">
        <CardHeader>
          <CardTitle>{profile.passwordSection}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              noValidate
              className="flex flex-col gap-4"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.currentPassword}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.newPassword}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[13px] text-muted">
                      {passwordRules}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{profile.confirmPassword}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={passwordForm.formState.isSubmitting}
              >
                {passwordForm.formState.isSubmitting
                  ? loading
                  : profile.savePassword}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

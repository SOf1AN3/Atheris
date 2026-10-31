"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateIdentityName, uploadIdentityDoc } from "@/actions/identity";
import { savePayoutMethod, type PayoutMethod } from "@/actions/payout";
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
import type {
  IdentityContent,
  PayoutContent,
  ProfileContent,
} from "@/content/platform/types";
import { cn } from "@/lib/utils";

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

// ---------------------------------------------------------------------------
// Bandeau d'erreur — motif du `banner` de `ProfileForms` (role="alert").
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }): ReactNode {
  return (
    <p
      role="alert"
      className="mb-4 flex items-start gap-1.5 text-[13px] font-medium text-destructive"
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
        <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M12 16.25h.01"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Formulaire de nom (L8 · verrou H5) — SDR dont `users.verified_at` est nul.
// ---------------------------------------------------------------------------

export type IdentityNameFormProps = {
  currentName: string;
  /** `dict.auth.signup.nameLabel`. */
  nameLabel: string;
  /** `dict.profile.saveName`. */
  saveLabel: string;
  /** `dict.profile.nameSaved` (toast). */
  savedMessage: string;
  /** `dict.profile.nameLockedHint` — affiché sur `conflict` (verrou H5). */
  lockedMessage: string;
  /** `dict.auth.validation.required`. */
  requiredMessage: string;
  /** `dict.auth.validation.tooLong(100)`. */
  tooLongMessage: string;
  /** Repli d'échec — `dict.auth.login.errors.generic`. */
  failedMessage: string;
  /** `dict.common.loading`. */
  loading: string;
};

function createNameFormSchema(messages: { required: string; tooLong: string }) {
  return z.object({
    name: z.string().trim().min(1, messages.required).max(100, messages.tooLong),
  });
}
type NameFormValues = z.infer<ReturnType<typeof createNameFormSchema>>;

/**
 * Changement de nom (section « Informations personnelles »). Le verrou est
 * appliqué CÔTÉ SERVEUR (`verified_at IS NULL` dans la clause WHERE d'
 * `updateIdentityName`) — ce formulaire n'est rendu que si la page serveur a
 * constaté `verifiedAt === null`, le code `conflict` couvre la course.
 */
export function IdentityNameForm({
  currentName,
  nameLabel,
  saveLabel,
  savedMessage,
  lockedMessage,
  requiredMessage,
  tooLongMessage,
  failedMessage,
  loading,
}: IdentityNameFormProps): ReactNode {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  const nameForm = useForm<NameFormValues>({
    resolver: zodResolver(
      createNameFormSchema({
        required: requiredMessage,
        tooLong: tooLongMessage,
      }),
    ),
    mode: "onTouched",
    defaultValues: { name: currentName },
  });

  const onNameSubmit = async (values: NameFormValues): Promise<void> => {
    setBanner(null);
    const result = await updateIdentityName({ name: values.name });
    if (result.ok) {
      toast.success(savedMessage);
      router.refresh();
      return;
    }
    if (result.code === "conflict") {
      // Verrou H5 effectif (vérification posée entre-temps) : le message
      // explique, et le re-fetch remplace le formulaire par l'état verrouillé.
      setBanner(lockedMessage);
      router.refresh();
      return;
    }
    setBanner(failedMessage);
  };

  return (
    <Card className="rounded-xl border-line bg-surface">
      <CardHeader>
        <CardTitle>{nameLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        {banner !== null ? <ErrorBanner message={banner} /> : null}
        <Form {...nameForm}>
          <form
            onSubmit={nameForm.handleSubmit(onNameSubmit)}
            noValidate
            className="flex flex-col gap-4"
          >
            <FormField
              control={nameForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{nameLabel}</FormLabel>
                  <FormControl>
                    <Input type="text" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={nameForm.formState.isSubmitting}
            >
              {nameForm.formState.isSubmitting ? loading : saveLabel}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dépôt de la pièce d'identité (L7a · D3) — champ FICHIER, pas de caméra.
// ---------------------------------------------------------------------------

export type IdentityDocUploadFormProps = {
  labels: IdentityContent;
};

/** Taille maximale — miroir de `MAX_DOC_BYTES` de `src/actions/identity.ts`. */
const MAX_DOC_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Liste blanche affichée au champ fichier — miroir de la validation serveur. */
const ACCEPTED_DOC_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Attribut `accept` du champ fichier (miroir de la liste blanche). */
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png,image/webp";

/** Code brut → message (jamais de string servie en dur côté serveur). */
function uploadErrorText(
  code: string,
  errors: IdentityContent["errors"],
): string {
  switch (code) {
    case "forbidden":
      return errors.forbidden;
    case "invalid":
      return errors.invalid;
    case "too_large":
      return errors.tooLarge;
    case "bad_type":
      return errors.badType;
    default:
      return errors.failed;
  }
}

/**
 * Formulaire de dépôt (ou de REMPLACEMENT) de la pièce d'identité. Un
 * re-upload écrase la pièce précédente et repasse le dossier en attente de
 * revue (D7) — les contrôles client sont doublés côté serveur (liste blanche
 * + taille réelle des octets lus).
 */
export function IdentityDocUploadForm({
  labels,
}: IdentityDocUploadFormProps): ReactNode {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBanner(null);

    // Contrôles client (le serveur revalide : liste blanche + taille réelle).
    if (file === null || file.size === 0) {
      setBanner(labels.errors.invalid);
      return;
    }
    if (file.size > MAX_DOC_UPLOAD_BYTES) {
      setBanner(labels.errors.tooLarge);
      return;
    }
    if (!ACCEPTED_DOC_TYPES.has(file.type)) {
      setBanner(labels.errors.badType);
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("document", file);
      const result = await uploadIdentityDoc(formData);
      if (result.ok) {
        toast.success(labels.uploadedToast);
        setFile(null);
        if (inputRef.current !== null) inputRef.current.value = "";
        router.refresh();
        return;
      }
      setBanner(uploadErrorText(result.code, labels.errors));
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setBanner(labels.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      {banner !== null ? <ErrorBanner message={banner} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg">
          {labels.uploadLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          aria-describedby={hintId}
          disabled={busy}
          onChange={(event) => {
            setBanner(null);
            setFile(event.target.files?.[0] ?? null);
          }}
          className="block w-full cursor-pointer rounded-xl border border-input bg-surface text-[14px] text-fg file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p id={hintId} className="text-[12px] text-muted">
          {labels.uploadHint}
        </p>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={busy}
        aria-disabled={busy}
      >
        {busy ? labels.uploading : labels.uploadAction}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Moyen de paiement (L8 · D4) — Wise / PayPal / banque, bloc unique.
// ---------------------------------------------------------------------------

export type PayoutFormProps = {
  labels: PayoutContent;
};

/** Champs du formulaire — tous présents en état, un seul bloc validé. */
type PayoutFormValues = {
  accountEmail: string;
  currency: string;
  holderName: string;
  bankName: string;
  iban: string;
  swiftBic: string;
};

const EMPTY_PAYOUT_VALUES: PayoutFormValues = {
  accountEmail: "",
  currency: "",
  holderName: "",
  bankName: "",
  iban: "",
  swiftBic: "",
};

/**
 * Bloc de validation Zod selon la méthode — MIROIR applicatif du schéma
 * serveur (`actions/payout.ts`) : un seul bloc est exigé, jamais les trois
 * (atomicité « un seul bloc rempli », motif du schéma).
 */
function createPayoutBlockSchema(
  method: PayoutMethod,
  errors: PayoutContent["errors"],
) {
  const email = z
    .string()
    .trim()
    .min(1, errors.required)
    .max(320, errors.invalid)
    .pipe(z.email({ error: errors.emailInvalid }));

  if (method === "wise") {
    return z.object({
      accountEmail: email,
      currency: z
        .string()
        .trim()
        .min(3, errors.required)
        .regex(/^[A-Za-z]{3}$/, errors.invalid),
    });
  }
  if (method === "paypal") {
    return z.object({ accountEmail: email });
  }
  return z.object({
    holderName: z
      .string()
      .trim()
      .min(1, errors.required)
      .max(120, errors.invalid),
    bankName: z.string().trim().min(1, errors.required).max(120, errors.invalid),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replaceAll(/\s+/g, "").toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{8,34}$/, errors.invalid)),
    swiftBic: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/, errors.invalid),
  });
}

/**
 * Formulaire du moyen de versement (section 3 du profil).
 *
 * ─── D4 — le formulaire est TOUJOURS vierge ────────────────────────────────
 * Les valeurs enregistrées ne reviennent jamais pré-remplies : elles ne sont
 * servies QUE masquées (`•••• 4821`, `a•••o@domaine.tld`) et un masque ne peut
 * pas reconstituer l'original. Enregistrer remplace donc le moyen existant,
 * en entier (le récapitulatif masqué reste visible au-dessus du formulaire).
 */
export function PayoutForm({
  labels,
}: PayoutFormProps): ReactNode {
  const router = useRouter();
  const baseId = useId();
  const radioName = `${baseId}-method`;
  const [method, setMethod] = useState<PayoutMethod>("wise");
  const [values, setValues] = useState<PayoutFormValues>(EMPTY_PAYOUT_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const methods: ReadonlyArray<{ value: PayoutMethod; label: string }> = [
    { value: "wise", label: labels.methodWise },
    { value: "paypal", label: labels.methodPaypal },
    { value: "bank", label: labels.methodBank },
  ];

  const methodFields: ReadonlyArray<{
    key: keyof PayoutFormValues;
    label: string;
    type: string;
    autoComplete?: string;
  }> =
    method === "wise"
      ? [
          {
            key: "accountEmail",
            label: labels.accountEmailLabel,
            type: "email",
            autoComplete: "email",
          },
          { key: "currency", label: labels.currencyLabel, type: "text" },
        ]
      : method === "paypal"
        ? [
            {
              key: "accountEmail",
              label: labels.accountEmailLabel,
              type: "email",
              autoComplete: "email",
            },
          ]
        : [
            {
              key: "holderName",
              label: labels.holderNameLabel,
              type: "text",
              autoComplete: "name",
            },
            { key: "bankName", label: labels.bankNameLabel, type: "text" },
            { key: "iban", label: labels.ibanLabel, type: "text" },
            { key: "swiftBic", label: labels.swiftLabel, type: "text" },
          ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBanner(null);
    setFieldErrors({});

    // Validation du SEUL bloc courant (doublon du contrôle serveur).
    const parsed = createPayoutBlockSchema(method, labels.errors).safeParse(
      values,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue === undefined) {
        setBanner(labels.errors.invalid);
        return;
      }
      const key = typeof issue.path[0] === "string" ? issue.path[0] : "";
      if (key === "") {
        setBanner(labels.errors.invalid);
        return;
      }
      setFieldErrors({ [key]: issue.message });
      return;
    }

    setBusy(true);
    try {
      const result = await savePayoutMethod({
        method,
        accountEmail: values.accountEmail,
        currency: values.currency.trim().toUpperCase(),
        holderName: values.holderName,
        bankName: values.bankName,
        iban: values.iban,
        swiftBic: values.swiftBic,
      });
      if (result.ok) {
        toast.success(labels.savedToast);
        setValues(EMPTY_PAYOUT_VALUES);
        router.refresh();
        return;
      }
      if (result.code === "forbidden") {
        setBanner(labels.errors.forbidden);
        return;
      }
      if (result.code === "invalid") {
        setBanner(labels.errors.invalid);
        return;
      }
      setBanner(labels.errors.failed);
    } catch {
      // Erreur d'infra propagée par l'action : aucun détail technique en UI.
      setBanner(labels.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-4"
    >
      {banner !== null ? <ErrorBanner message={banner} /> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-fg">
          {labels.methodLabel}
        </legend>
        <div className="flex flex-wrap gap-2">
          {methods.map((item) => (
            <label
              key={item.value}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-[13px] font-semibold transition-colors duration-150",
                method === item.value
                  ? "border-line-2 bg-surface-2 text-fg"
                  : "border-line text-muted hover:text-fg",
              )}
            >
              <input
                type="radio"
                name={radioName}
                value={item.value}
                checked={method === item.value}
                disabled={busy}
                onChange={() => {
                  setMethod(item.value);
                  setFieldErrors({});
                }}
                className="size-4"
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      {methodFields.map((field) => {
        const fieldId = `${baseId}-${field.key}`;
        const error = fieldErrors[field.key];
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <label
              htmlFor={fieldId}
              className="text-[13px] font-semibold text-fg"
            >
              {field.label}
            </label>
            <Input
              id={fieldId}
              type={field.type}
              autoComplete={field.autoComplete}
              value={values[field.key]}
              aria-invalid={error !== undefined}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                setValues((current) => ({ ...current, [field.key]: next }));
                if (error !== undefined) setFieldErrors({});
              }}
            />
            {error !== undefined ? (
              <p role="alert" className="text-[12px] font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      <Button
        type="submit"
        className="w-full"
        disabled={busy}
        aria-disabled={busy}
      >
        {busy ? labels.saving : labels.saveAction}
      </Button>
    </form>
  );
}

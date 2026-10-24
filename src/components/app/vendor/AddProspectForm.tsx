"use client";

/**
 * Atheris — formulaire « Nouveau prospect » (FE-7 · T20 · DESIGN.md §3.6).
 *
 * Mobile-first : un seul écran, champs pleine largeur à 48px, labels
 * toujours visibles (jamais de placeholder-à-la-place-du-label), erreurs
 * reliées par `aria-describedby` + `role="alert"` (via les composants
 * `Form*` de shadcn, §3.6).
 *
 * SÉCURITÉ : appelle **uniquement** `addMyProspect` (`@/actions/vendor`) —
 * le viewer est reconstruit côté serveur, aucun `{ id, role }` ne transite
 * par ce composant. `createProspect` (contrat C-5) n'est jamais importé ici.
 *
 * VALIDATION : miroir local du Zod serveur (email `trim().toLowerCase()`,
 * téléphone min 6 caractères, nom min 2) — la saisie est validée côté client
 * sans requête, le serveur revalide tout (défense en profondeur).
 *
 * HONEYPOT (DESIGN §3.6) : champ `company_website` masqué
 * (`position:absolute; left:-9999px`, `aria-hidden`, `tabIndex=-1`), relié
 * au champ `honeypot` du contrat serveur : rempli → refus `invalid`.
 *
 * Libellés/messages : props **sérialisables** résolues côté serveur depuis
 * le dictionnaire (ce composant n'importe jamais `@/i18n/*`).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { addMyProspect } from "@/actions/vendor";
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
import { Textarea } from "@/components/ui/textarea";

/** Libellés de champs, résolus dans la page server (100 % dict). */
export type AddProspectFormLabels = {
  /** `dict.prospect.fields.fullName` — champ Nom / entreprise. */
  name: string;
  /** `dict.prospect.labels.email`. */
  email: string;
  /** `dict.prospect.labels.phone`. */
  phone: string;
  /** `dict.prospect.fields.note` — champ Note (optionnel). */
  note: string;
  /** `dict.common.submit`. */
  submit: string;
  /** Suffixe optionnel affiché derrière le label de la note. */
  optionalSuffix: string;
};

/** Messages i18n, tous en chaînes (les `tooShort`/`tooLong` du dict sont des
 * fonCTIONS : la page les résout ici en strings avant transmission). */
export type AddProspectFormMessages = {
  required: string;
  emailInvalid: string;
  phoneInvalid: string;
  /** `auth.validation.tooShort(2)` résolu server-side. */
  nameTooShort: string;
  /** `auth.validation.tooLong(2000)` résolu server-side. */
  noteTooLong: string;
  /** `pipeline.messages.duplicate` — erreur serveur sous l'email. */
  duplicate: string;
  /** `pipeline.messages.createdToast`. */
  createdToast: string;
  /** `common.retry` — repli pour tout code serveur inattendu. */
  retry: string;
};

type AddProspectFormProps = {
  /** Locale courante (construit le chemin de redirection, jamais validée). */
  locale: string;
  labels: AddProspectFormLabels;
  messages: AddProspectFormMessages;
};

/**
 * Fabrique le schéma Zod client — **miroir** du `createProspectSchema`
 * serveur (`@/actions/prospects`, figé) : mêmes contraintes, messages i18n
 * injectés. La normalisation email est faite par Zod lui-même (`trim` +
 * `toLowerCase`) avant validation, exactement comme côté serveur.
 */
function createProspectFormSchema(messages: AddProspectFormMessages) {
  return z.object({
    // Chaînage des `min` : le premier échec l'emporte — vide → `required`,
    // sinon trop court → message dédié (miroir des contraintes serveur).
    name: z
      .string()
      .trim()
      .min(1, messages.required)
      .min(2, messages.nameTooShort)
      .max(120, messages.nameTooShort),
    email: z
      .string()
      .trim()
      .min(1, messages.required)
      .toLowerCase()
      .pipe(z.email({ error: messages.emailInvalid })),
    phone: z
      .string()
      .trim()
      .min(1, messages.required)
      .min(6, messages.phoneInvalid),
    note: z.string().trim().max(2000, messages.noteTooLong).optional(),
    // Honeypot : jamais validé côté client (vide attendu), seulement transmis.
    company_website: z.string().max(200).optional(),
  });
}

type AddProspectFormValues = z.infer<ReturnType<typeof createProspectFormSchema>>;

export function AddProspectForm({
  locale,
  labels,
  messages,
}: AddProspectFormProps) {
  const router = useRouter();
  /** Erreur globale (code serveur inattendu) — affichée en bandeau `role="alert"`. */
  const [banner, setBanner] = useState<string | null>(null);

  const form = useForm<AddProspectFormValues>({
    resolver: zodResolver(createProspectFormSchema(messages)),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      note: "",
      company_website: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: AddProspectFormValues): Promise<void> => {
    setBanner(null);
    const result = await addMyProspect({
      fullName: values.name,
      email: values.email,
      phone: values.phone,
      note: values.note !== undefined && values.note.length > 0 ? values.note : undefined,
      // Honeypot : champ DOM `company_website` → champ du contrat `honeypot`.
      honeypot: values.company_website,
    });

    if (result.ok) {
      toast.success(messages.createdToast);
      router.push(`/${locale}/espace/prospects/${result.id}`);
      router.refresh();
      return;
    }

    if (result.code === "duplicate") {
      // Message sous le champ email, relié par `aria-describedby` (§3.6).
      form.setError("email", { type: "server", message: messages.duplicate });
      return;
    }

    // `invalid` (honeypot remplu, entrée malformée…) ou `forbidden`.
    setBanner(messages.retry);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex w-full flex-col gap-5"
      >
        {/* Bandeau d'erreur global (état erreur — aucun code métier fuité). */}
        {banner !== null ? (
          <p
            role="alert"
            className="rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.12)] px-4 py-3 text-[13px] font-medium text-[#F87171]"
          >
            {banner}
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.name}</FormLabel>
              <FormControl>
                {/* §3.6 : pleine largeur, 48px, radius 12px (défaut Input). */}
                <Input
                  {...field}
                  className="h-12"
                  autoComplete="name"
                  maxLength={120}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.email}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  inputMode="email"
                  className="h-12"
                  autoComplete="email"
                  maxLength={254}
                />
              </FormControl>
              {/* Le message (Zod local ou `duplicate` serveur) est rendu par
                  FormMessage et relié au champ via `aria-describedby`. */}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.phone}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  inputMode="tel"
                  className="h-12"
                  autoComplete="tel"
                  maxLength={40}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {labels.note}
                <span className="ml-1.5 font-normal text-muted">
                  {labels.optionalSuffix}
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  /* §3.6 : min 80px (textarea du DESIGN ≥ 128px sur desktop ;
                     80px en mobile-first). */
                  className="min-h-20"
                  maxLength={2000}
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Honeypot — DESIGN §3.6 : masqué, hors flux tabulaire, ignoré par
            les lecteurs d'écran. Le `label` pointe sur un champ invisible :
            le nom du champ porte lui-même l'information (pas de `htmlFor`). */}
        <FormField
          control={form.control}
          name="company_website"
          render={({ field }) => (
            <FormItem className="relative">
              <FormLabel className="sr-only">company_website</FormLabel>
              <FormControl>
                <input
                  {...field}
                  type="text"
                  name="company_website"
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute left-[-9999px] h-0 w-0 border-0 p-0 opacity-0"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="md"
          disabled={isSubmitting}
          /* État submitting (DESIGN) : bouton désactivé + `opacity-70`. */
          className={isSubmitting ? "h-12 w-full opacity-70" : "h-12 w-full"}
        >
          {isSubmitting ? `${labels.submit}…` : labels.submit}
        </Button>
      </form>
    </Form>
  );
}

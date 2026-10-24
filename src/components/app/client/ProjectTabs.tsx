"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Props (sérialisables : labels résolus server-side, panneaux fournis par la
// page server — pattern FE-5 : la RSC rend des Server Components en
// `children`, seuls les primitives Tabs sont côté client).
// ---------------------------------------------------------------------------

/** Libellés des 4 onglets, tous résolus dans `dict.client.*`. */
export type ProjectTabsLabels = {
  /** `client.milestones` — onglet Suivi. */
  tracking: string;
  /** `client.documents` — onglet Documents. */
  documents: string;
  /** `client.invoices` — onglet Factures. */
  invoices: string;
  /** `client.messages` — onglet Messagerie. */
  messages: string;
};

type ProjectTabsProps = {
  labels: ProjectTabsLabels;
  /** Timeline des jalons (Server Component passé depuis la page). */
  trackingPanel: ReactNode;
  /** Liste des documents (Server Component — `DocList`). */
  documentsPanel: ReactNode;
  /** Échéancier / factures (Server Component — `DocList`). */
  invoicesPanel: ReactNode;
  /** Fil de discussion (Client Component — `Thread`). */
  messagesPanel: ReactNode;
};

/**
 * Onglets du portail client (FE-9 · T28) : Suivi · Documents · Factures ·
 * Messagerie. Valeurs d'onglet stables (`suivi`…) — aucune écriture d'URL :
 * l'état actif est local au composant (une simple string `defaultValue`).
 */
export function ProjectTabs({
  labels,
  trackingPanel,
  documentsPanel,
  invoicesPanel,
  messagesPanel,
}: ProjectTabsProps): ReactNode {
  return (
    <Tabs defaultValue="suivi">
      {/* Rail responsive : défilement horizontal doux sur mobile (le contenu
          des onglets ne déborde jamais — chaque panneau est fluide). */}
      <div className="w-full overflow-x-auto pb-1">
        <TabsList>
          <TabsTrigger value="suivi">{labels.tracking}</TabsTrigger>
          <TabsTrigger value="documents">{labels.documents}</TabsTrigger>
          <TabsTrigger value="factures">{labels.invoices}</TabsTrigger>
          <TabsTrigger value="messages">{labels.messages}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="suivi">{trackingPanel}</TabsContent>
      <TabsContent value="documents">{documentsPanel}</TabsContent>
      <TabsContent value="factures">{invoicesPanel}</TabsContent>
      <TabsContent value="messages">{messagesPanel}</TabsContent>
    </Tabs>
  );
}

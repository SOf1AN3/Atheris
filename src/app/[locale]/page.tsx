import { notFound } from "next/navigation";

import { CaseStudies } from "@/components/sections/CaseStudies";
import { Contact } from "@/components/sections/Contact";
import { Faq } from "@/components/sections/Faq";
import { Hero } from "@/components/sections/Hero";
import { Process } from "@/components/sections/Process";
import { Services } from "@/components/sections/Services";
import { TechStack } from "@/components/sections/TechStack";
import { Testimonials } from "@/components/sections/Testimonials";
import { getDictionary } from "@/i18n/dictionaries";
import { isValidLocale } from "@/i18n/config";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Landing page bilingue : les 10 sections montées dans l'ordre de la spec.
 * Le H1 est fourni par `Hero` (aucun H1 supplémentaire ici).
 */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  // Défensif : le layout racine a déjà validé la locale.
  if (!isValidLocale(locale)) {
    notFound();
  }

  const dict = await getDictionary(locale);

  return (
    <main id="main" tabIndex={-1} className="focus:outline-none">
      <Hero hero={dict.hero} />
      <Services services={dict.services} />
      <CaseStudies cases={dict.cases} filtersLabel={dict.a11y.filtersLabel} />
      <TechStack
        techStack={dict.techStack}
        tabsLabel={dict.a11y.stackTabsLabel}
      />
      <Process process={dict.process} />
      <Testimonials testimonials={dict.testimonials} />
      <Faq faq={dict.faq} />
      <Contact contact={dict.contact} />
    </main>
  );
}

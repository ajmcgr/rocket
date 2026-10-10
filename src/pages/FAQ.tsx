import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { faqSections } from "@/content/rocketFaq";

const FAQ = () => {
  useDocumentMeta({
    title: "Rocket FAQ — Discovery, app claims, verification, and accounts",
    description: "Answers about discovering and saving independent apps, launching and claiming an app, verification, Rocket integrations, creative tools, and billing.",
    canonical: "https://tryrocket.ai/faq",
  });

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Frequently asked questions</h1>
          <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-300">Clear answers about what Rocket does today.</p>
        </header>

        {faqSections.map((section) => (
          <section key={section.title} className="mt-12">
            <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
            <Accordion type="multiple" defaultValue={section.questions.map(({ q }) => q)} className="mt-5 space-y-3">
              {section.questions.map(({ q, a }) => (
                <AccordionItem key={q} value={q} className="rounded-xl border border-neutral-200 bg-white px-5 dark:border-neutral-800 dark:bg-neutral-900">
                  <AccordionTrigger className="py-5 text-left font-semibold text-neutral-900 dark:text-white">{q}</AccordionTrigger>
                  <AccordionContent className="pb-5 leading-7 text-neutral-600 dark:text-neutral-300">{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}

        <div className="mt-12 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="font-semibold">Still have a question?</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Tell us what you need help with.</p>
          </div>
          <Link to="/contact" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa] sm:mt-0">Contact Rocket</Link>
        </div>
      </main>

    </div>
  );
};

export default FAQ;

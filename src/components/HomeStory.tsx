import { Link } from "@/lib/router-compat";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqSections } from "@/content/rocketFaq";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";

const featuredQuestions = new Set([
  "What is Rocket?",
  "Are all apps on Rocket reviewed or recommended?",
  "How do Rankings work?",
  "How do I add my app?",
  "Does claiming my app verify that I own it?",
  "Can I buy every app through Rocket?",
]);

const questions = faqSections
  .flatMap((section) => section.questions)
  .filter(({ q }) => featuredQuestions.has(q));

export default function HomeStory() {
  return (
    <div className="mx-auto mt-20 max-w-5xl space-y-16 sm:mt-24 sm:space-y-20">
      <section aria-labelledby="home-faq-heading" className="mx-auto max-w-3xl">
        <h2
          id="home-faq-heading"
          className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
        >
          Frequently asked questions
        </h2>
        <p className="mt-3 text-neutral-600">
          A few things to know about finding and building apps on Rocket.
        </p>
        <Accordion type="single" collapsible className="mt-8 space-y-3">
          {questions.map(({ q, a }) => (
            <AccordionItem
              key={q}
              value={q}
              className="rounded-xl border border-neutral-200 bg-white px-5"
            >
              <AccordionTrigger className="py-4 text-left font-semibold text-neutral-900">
                {q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 leading-7 text-neutral-600">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <Link
          to="/faq"
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#167ac6] hover:underline"
        >
          Read all FAQs{" "}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </Link>
      </section>

      <section
        aria-labelledby="home-letter-heading"
        className="mx-auto max-w-4xl rounded-3xl border border-neutral-200 bg-neutral-50 px-6 py-8 sm:px-10 sm:py-10"
      >
        <p className="text-sm font-semibold text-neutral-500">
          A note from our founder
        </p>
        <h2
          id="home-letter-heading"
          className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl"
        >
          Why we built Rocket
        </h2>
        <div className="mt-5 max-w-3xl space-y-4 leading-7 text-neutral-700">
          <p>
            Hello there! More people can build useful software than ever before.
            The hard part is finding it. Promising apps are scattered across
            launch sites, social posts, and personal websites. Rocket brings
            them together so you can discover new arrivals, browse by category,
            and save what you want to try.
          </p>
          <p>
            For builders, an app profile is a clearer way to show what they have
            made, claim a listing, and choose which verified details to share.
            We want good software to find the people who need it.
          </p>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-neutral-200 pt-6">
          <img
            src={alexAvatar.url}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
          <div>
            <p className="font-semibold text-neutral-950">Alex MacGregor</p>
            <p className="text-sm text-neutral-600">Founder, Rocket</p>
          </div>
          <Link
            to="/about"
            className="ml-auto inline-flex min-h-11 items-center text-sm font-semibold text-[#167ac6] hover:underline"
          >
            Read the full letter{" "}
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

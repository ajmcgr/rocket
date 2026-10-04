import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const sections = [
  {
    title: "Discovering apps",
    questions: [
      { q: "What is Rocket?", a: "Rocket helps people discover apps worth using. You can search, browse categories, explore New and Rankings, view app profiles, and save apps to revisit." },
      { q: "Are all apps on Rocket reviewed or recommended?", a: "No. An indexed app is one Rocket knows about; listing does not equal endorsement. A Rocket Pick is an explicit editorial selection. Claims and verification describe specific evidence, not an overall quality guarantee." },
      { q: "How do Rankings work?", a: "Rankings list the top 20 eligible apps by observed public Launch vote totals. Category rankings are offered when at least 20 apps qualify. They do not claim verified customer growth, revenue, or Rocket endorsement." },
      { q: "Can I use every listed app with my Rocket account?", a: "No. You can use your Rocket account for Rocket features such as saving apps. Only apps that have explicitly integrated Rocket identity support Continue with Rocket; other apps use their own sign-in." },
      { q: "Can I buy every app through Rocket?", a: "No. Rocket payments are available only where a developer has integrated them for that app. Otherwise, pricing and payment happen on the app's own website." },
      { q: "How do I save an app?", a: "Select Save on an app card or profile and sign in if prompted. Your saved apps are private to your Rocket account." },
      { q: "How do I report an inaccurate or problematic listing?", a: "Use the report or correction option on the app profile where available, or send its URL and the issue through our contact form. We review reported information rather than automatically changing another owner's listing." },
    ],
  },
  {
    title: "Launching and managing an app",
    questions: [
      { q: "How do I add my app?", a: "Open Submit your app and paste its public URL. Rocket first looks for an existing canonical listing. You can review the result before signing in to continue a claim or submission." },
      { q: "What if my app is already listed?", a: "Claim the existing app rather than creating a duplicate. If multiple records might match, Rocket asks you to resolve the ambiguity instead of guessing." },
      { q: "Does claiming my app verify that I own it?", a: "Not by itself. A claim starts the ownership process. Domain verification uses a real DNS or website challenge before Rocket marks domain ownership as verified." },
      { q: "Can I edit my app profile?", a: "Verified owners can manage supported public presentation details in Your Apps. Owner edits do not replace Rocket's source provenance, public evidence, user reviews, or verification history." },
      { q: "Can I connect Rocket Login or payments?", a: "Supported developers can configure Rocket identity and payments for apps they own. These capabilities require a deliberate integration and are not turned on for every indexed app." },
      { q: "Can I show traffic or revenue on my profile?", a: "Only supported, connected evidence can be shown as verified. Provider metrics are private by default, and owners choose supported public visibility. Availability and verification depend on the specific integration and account." },
    ],
  },
  {
    title: "Buy with Rocket fees",
    questions: [
      { q: "What is the Buy with Rocket take rate?", a: "Rocket takes a 5% platform fee on payments through new Buy with Rocket plans. This transaction fee is separate from the $99/year Rocket Developer membership." },
      { q: "Are Stripe processing fees included in the 5%?", a: "No. Stripe processing fees and any other applicable charges are separate. On a $100 payment, Rocket's platform fee is $5, leaving $95 for the app before those separate costs." },
    ],
  },
  {
    title: "Account, creative tools, and billing",
    questions: [
      { q: "Do I need an account to browse Rocket?", a: "No. Discovery and public app profiles are available without signing in. An account is needed to save apps, claim an app, manage a listing, or use account-based tools." },
      { q: "What can I create on Rocket?", a: "Rocket also offers logo, icon, design, and Brand Kit tools. These are separate from browsing or claiming an app and may use credits or a paid plan." },
      { q: "Where can I see pricing and manage billing?", a: "Current Rocket plans and credits are listed on Pricing. Signed-in users can manage their Rocket billing from Settings. An independent app's own subscription is separate unless it explicitly uses Rocket payments." },
      { q: "Can I disconnect a provider or revoke an app?", a: "Supported provider connections and sharing controls live with the relevant app in Your Apps. You can view and revoke third-party app authorization from Connected Apps in your Rocket account." },
      { q: "How do I get help?", a: "Send us a message through Contact. Include the relevant Rocket or app URL and a short description, but never send passwords, API keys, or payment-card details." },
    ],
  },
];

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

        {sections.map((section) => (
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

import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const steps = {
  people: [
    { title: "Discover", body: "Search apps, browse categories, or explore New and Rankings. Rankings use public Launch votes, not verified customer growth or a Rocket endorsement." },
    { title: "Decide", body: "Open an app profile for its description, website, source, and any evidence the owner has chosen to share. An indexed listing does not mean Rocket recommends the app." },
    { title: "Save and visit", body: "Save apps to revisit with your Rocket account. When you are ready, follow the website link to use the app on its own site." },
  ],
  builders: [
    { title: "Submit", body: "Paste your app URL. Rocket checks whether the app is already indexed before preparing a new listing, so you do not have to start from scratch." },
    { title: "Claim and verify", body: "Sign in to claim the right app. Domain ownership can be verified with a challenge; claiming alone is not the same as verification." },
    { title: "Tell your story", body: "Manage your public profile in Your Apps. Add accurate details and choose which supported evidence, if any, to make visible." },
    { title: "Connect where supported", body: "Rocket identity and payment integrations are available for apps that explicitly integrate them. They are not automatically enabled for every listing." },
  ],
};

const StepList = ({ items }: { items: typeof steps.people }) => (
  <ol className="mt-7 space-y-6">
    {items.map((step, index) => (
      <li key={step.title} className="flex gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf5fc] text-sm font-semibold text-[#176f9f] dark:bg-[#163b53] dark:text-[#a3dcff]">{index + 1}</span>
        <div>
          <h3 className="font-semibold text-neutral-950 dark:text-white">{step.title}</h3>
          <p className="mt-1 leading-7 text-neutral-600 dark:text-neutral-300">{step.body}</p>
        </div>
      </li>
    ))}
  </ol>
);

const StartHere = () => {
  useDocumentMeta({
    title: "Start here — How Rocket works",
    description: "A practical guide to discovering independent apps and launching your own app on Rocket.",
    canonical: "https://tryrocket.ai/start",
  });

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Start here</h1>
          <p className="mt-5 text-lg leading-8 text-neutral-600 dark:text-neutral-300">Rocket helps people discover independent apps worth using and gives builders a place to launch, build trust, and reach new users.</p>
        </header>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-200 bg-white p-7 dark:border-neutral-800 dark:bg-neutral-900 sm:p-9">
            <h2 className="text-2xl font-bold tracking-tight">Looking for an app?</h2>
            <StepList items={steps.people} />
            <Link to="/discover" className="mt-9 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa]">Discover apps</Link>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-7 dark:border-neutral-800 dark:bg-neutral-900 sm:p-9">
            <h2 className="text-2xl font-bold tracking-tight">Building an app?</h2>
            <StepList items={steps.builders} />
            <Link to="/submit" className="mt-9 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa]">Submit your app</Link>
          </section>
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-6 text-neutral-500 dark:text-neutral-400">
          A Rocket account saves your apps and supports Rocket features; it does not automatically sign you in to every app in the catalogue. Have a question? <Link to="/faq" className="font-semibold text-[#267cbb] underline underline-offset-4">Read the FAQ</Link> or <Link to="/contact" className="font-semibold text-[#267cbb] underline underline-offset-4">contact us</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
};

export default StartHere;

import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Link } from "@/lib/router-compat";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const About = () => {
  useDocumentMeta({
    title: "About Rocket — Discover independent apps worth using",
    description: "Rocket helps people discover independent apps and gives builders a place to launch, build trust, connect, and grow.",
    canonical: "https://tryrocket.ai/about",
  });

  return <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <SiteHeader />
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white px-6 py-10 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-12 sm:py-14">
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">About Rocket</h1>

        <div className="mt-10 space-y-6 text-base leading-8 text-neutral-700 dark:text-neutral-300 sm:text-lg">
          <p>Rocket is a place to discover independent apps worth using.</p>
          <p className="font-semibold text-neutral-950 dark:text-white">Hello there!</p>
          <p>
            Independent builders are making remarkable software. We want to make it easier for people to find those apps, understand what they do, and decide which ones are worth their time.
          </p>
          <p>
            For builders, Rocket is a place to bring an app into the open, tell its story, and build a relationship with the people who use it. Here is what you can do today:
          </p>

          <div className="space-y-4 border-l-2 border-[#167ac6] pl-5">
            <p><strong className="text-neutral-950 dark:text-white">Submit</strong><br />Add your app to Rocket.</p>
            <p><strong className="text-neutral-950 dark:text-white">Verify</strong><br />Build trust with details you choose to share.</p>
            <p><strong className="text-neutral-950 dark:text-white">Connect</strong><br />Use Rocket identity and payment integrations where supported.</p>
            <p><strong className="text-neutral-950 dark:text-white">Grow</strong><br />Help more people discover your app.</p>
          </div>

          <p>
            Rocket is still growing. Not every listed app is claimed or connected, and a listing is not an endorsement. We will keep making discovery more useful and giving independent developers better ways to earn trust.
          </p>
        </div>

        <Link to="/submit" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#167ac6] px-5 text-sm font-semibold text-white transition hover:bg-[#1268aa]">
          Submit your app
        </Link>

        <div className="mt-14 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <img src={alexAvatar.url} alt="Alex MacGregor" className="h-20 w-20 rounded-full object-cover" />
          <p className="mt-4 font-semibold text-neutral-950 dark:text-white">Alex MacGregor</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Founder, Rocket</p>
          <a href="https://x.com/alexmacgregor__" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-[#267cbb] underline underline-offset-4 dark:text-[#80c7f4]">
            Follow me on X
          </a>
        </div>
      </article>
    </main>
    <SiteFooter />
  </div>;
};

export default About;

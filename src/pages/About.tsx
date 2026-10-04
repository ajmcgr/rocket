import SiteHeader from "@/components/SiteHeader";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const About = () => {
  useDocumentMeta({
    title: "About Rocket — The open app platform",
    description: "Find rising apps and new software from vibe coders and developers. Learn what Rocket does today and how we help people discover new software.",
    canonical: "https://tryrocket.ai/about",
  });

  return <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <SiteHeader />
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white px-6 py-10 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-12 sm:py-14">
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">About Rocket</h1>

        <div className="mt-10 space-y-7 text-lg leading-8 text-neutral-700 dark:text-neutral-300 sm:text-xl sm:leading-9">
          <p>Rocket is the open app platform to find rising apps and new software from vibe coders and developers.</p>
          <p className="font-semibold text-neutral-950 dark:text-white">Hello there!</p>
          <p>
            More people can build useful software than ever before. The hard part is finding it. Promising apps can be scattered across launch sites, social posts, and personal websites, with little context to help you decide what is worth trying. Rocket brings them into a place where you can browse by category, explore new arrivals, see public Launch activity, and save the apps you want to revisit.
          </p>
          <p>
            For the people making those apps, a Rocket profile is a clearer way to show what they have built. Vibe coders and developers can submit an app, claim an existing listing, improve its public information, and choose which verified details to share. That gives visitors a better basis for understanding the product while keeping the builder in control of their own information.
          </p>
          <p>
            A listing is not an endorsement. Rankings based on public Launch activity do not prove customer growth, and a claimed app is not automatically verified in every way. Where an app supports Rocket identity or payments, those capabilities belong to that specific connected app; they are not available across the whole catalogue.
          </p>
          <p>
            Rocket is still growing. Our aim is to make discovery genuinely useful for visitors and to give builders a fairer, more trustworthy way to be found. We will keep improving the information people can rely on without asking them to mistake an indexed app for a recommendation.
          </p>
        </div>

        <div className="mt-14">
          <img src={alexAvatar.url} alt="Alex MacGregor" className="h-20 w-20 rounded-full object-cover" />
          <p className="mt-4 font-semibold text-neutral-950 dark:text-white">Alex MacGregor</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Founder, Rocket</p>
          <a href="https://x.com/alexmacgregor__" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-[#267cbb] underline underline-offset-4 dark:text-[#80c7f4]">
            Follow me on X
          </a>
        </div>
      </article>
    </main>

  </div>;
};

export default About;

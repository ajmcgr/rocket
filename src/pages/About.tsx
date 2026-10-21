import SiteHeader from "@/components/SiteHeader";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";

const About = () => {
  return <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <SiteHeader />
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white px-6 py-10 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:px-12 sm:py-14">
        <h1 className="text-center text-4xl font-bold tracking-tight sm:text-5xl">About Rocket</h1>

        <div className="mt-10 space-y-7 text-base leading-7 text-neutral-700 dark:text-neutral-300 sm:text-lg sm:leading-8">
          <p className="font-semibold text-neutral-950 dark:text-white">Hello there!</p>
          <p>
            More people can build useful software than ever before. The hard part is finding it.
          </p>
          <p>
            Promising apps are scattered across launch sites, social posts, and personal websites. You might hear about something useful, open a tab, and forget it by the next day. Somewhere else, someone has built exactly the tool you need, but you never come across it.
          </p>
          <p>
            Rocket brings those apps together. A place to discover new arrivals, browse by category, explore what other people are finding, and save the things you want to try. Whether you are looking for a tool for work, something for a personal project, or just an interesting app, we want that search to feel easier.
          </p>
          <p>
            For builders, getting an app online is only the beginning. You still need to explain what it does, find the people it could help, and give them a reason to try it. That is a lot to take on, especially when you are building on your own or with a small team.
          </p>
          <p>
            An app profile on Rocket gives your work a place to be found. You can submit something new or claim an existing listing, verify your ownership, and keep its information up to date. Your developer profile connects the things you build, so people can get to know the person behind the software and discover what else you have made.
          </p>
          <p>
            We also want people to have more context when deciding what to try. A clear description, a look at the app, feedback from other users, and details the developer has chosen to verify and share can all help. Builders should stay in control of what they make public.
          </p>
          <p>
            That is why we are building Rocket as an open app platform. A place that stays useful beyond launch day, where people can keep discovering software and builders can keep improving how they present their work. You might arrive with a finished app, an early idea, or no plans to build anything at all. There is room for all of that here.
          </p>
          <p>
            Rocket is still growing. We will keep listening to the people using it and the people building on it, and keep working on making those connections more useful.
          </p>
          <p>
            We want good software to find the people who need it.
          </p>
          <p>
            Thanks for being here.
          </p>
        </div>

        <div className="mt-14">
          <img src={alexAvatar.url} alt="Alex MacGregor" className="h-28 w-28 rounded-none object-cover" />
          <img src="/alex-macgregor-signature.png" alt="Alex MacGregor’s signature" className="mt-4 h-auto w-32 object-contain dark:invert dark:mix-blend-screen" />
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

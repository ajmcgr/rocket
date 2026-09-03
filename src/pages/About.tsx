import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import alexAvatar from "@/assets/alex-macgregor.png.asset.json";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const About = () => {
  useDocumentMeta({
    title: "About Rocket — AI brand studio for founders",
    description: "Learn why Rocket helps founders turn raw ideas into coordinated logos, icons and complete Brand Kits.",
    canonical: "https://tryrocket.ai/about",
  });

  return <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">About Rocket</h1>
      <p className="mt-8 text-lg leading-relaxed text-neutral-700">
        Rocket is a logo-first AI brand studio where founders turn raw ideas into memorable, launch-ready brands.
      </p>
      <p className="mt-6 font-semibold text-neutral-900">Hello there!</p>
      <p className="mt-4 text-lg leading-relaxed text-neutral-700">
        We believe the future of software is being built by founders who use AI to ship at a speed that was impossible just a few years ago. Our mission is to help these builders create distinctive visual identities so their products look as considered as the software behind them.
      </p>
      <p className="mt-4 text-lg leading-relaxed text-neutral-700">
        Founders drop in a URL or describe an idea and Rocket generates coordinated logo directions, a wordmark, icon, colours and typography. They can refine a favourite direction in the editor and turn it into a complete Brand Kit with practical files, social assets and guidelines.
      </p>
      <p className="mt-4 text-lg leading-relaxed text-neutral-700">
        Whether you're shipping your first AI tool or your tenth product, Rocket helps you move from an unbranded idea to an identity you can use across your website, product and launch channels.
      </p>

      <div className="mt-16">
        <img
          src={alexAvatar.url}
          alt="Alex MacGregor"
          className="h-32 w-32 rounded-none object-cover"
        />
        <h3 className="mt-5 text-xl font-bold text-neutral-900">Alex MacGregor</h3>
        <p className="text-xl font-bold text-neutral-900">Founder, Rocket</p>
        <p className="mt-3">
          <a
            href="https://x.com/alexmacgregor__"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-brand underline underline-offset-4"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.86l-5.37-6.62L4.1 22H.84l8.04-9.19L.5 2h7.02l4.86 6.06L18.244 2Zm-2.4 18h1.9L7.27 4H5.25l10.594 16Z" />
            </svg>
            Follow me on X
          </a>
        </p>
      </div>
    </main>
    <SiteFooter />
  </div>;
};

export default About;

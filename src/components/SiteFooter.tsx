import { Link } from "react-router-dom";
import { tools } from "@/content/tools";
import { articles } from "@/content/articles";
import { comparisons } from "@/content/comparisons";
import { Instagram } from "lucide-react";

const HEADER = "text-base font-semibold text-neutral-900";

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.797l-5.32-6.96L4.8 22H1.54l8.02-9.17L1 2h6.93l4.81 6.36L18.244 2Zm-1.19 18h1.88L7.04 4H5.06l11.994 16Z" />
  </svg>
);

const DiscordIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.36 14.36 0 0 0-.65 1.34 18.27 18.27 0 0 0-5.487 0A12.65 12.65 0 0 0 9.77 3 19.74 19.74 0 0 0 6.01 4.37C2.62 9.43 1.71 14.36 2.16 19.21a19.94 19.94 0 0 0 6.07 3.05c.49-.67.93-1.39 1.3-2.14a13 13 0 0 1-2.05-.98c.17-.13.34-.26.5-.4 3.94 1.82 8.2 1.82 12.1 0 .17.14.33.27.5.4-.66.39-1.35.72-2.06.98.38.75.81 1.47 1.3 2.14a19.93 19.93 0 0 0 6.08-3.05c.55-5.65-.91-10.54-3.84-14.84ZM9.34 16.34c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.2 0 2.18 1.09 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm5.32 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.2 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
  </svg>
);

const SiteFooter = () => (
  <footer className="bg-neutral-50">
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-6">
        <div>
          <div className={HEADER}>Company</div>
            <ul className="mt-4 space-y-2.5 text-sm font-normal text-neutral-600">
            <li><Link to="/about" className="hover:text-neutral-900">About</Link></li>
            <li><Link to="/blog" className="hover:text-neutral-900">Blog</Link></li>
            <li><Link to="/brand-kit" className="hover:text-neutral-900">Brand Kit</Link></li>
            <li><Link to="/ai-info" className="hover:text-neutral-900">AI Info</Link></li>
          </ul>
        </div>
        <div>
          <div className={HEADER}>Support</div>
          <ul className="mt-4 space-y-2.5 text-sm font-normal text-neutral-600">
            <li><a href="mailto:alex@tryrocket.ai" className="hover:text-neutral-900">Support</a></li>
            <li><Link to="/privacy" className="hover:text-neutral-900">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-neutral-900">Terms of Service</Link></li>
          </ul>
        </div>
        <div>
          <div className={HEADER}>Resources</div>
          <ul className="mt-4 space-y-2.5 text-sm font-normal text-neutral-600">
            {articles.slice(0, 10).map((a) => (
              <li key={a.slug}><Link to={`/blog/${a.slug}`} className="hover:text-neutral-900">{a.title}</Link></li>
            ))}
            <li><Link to="/blog" className="font-semibold hover:text-neutral-900">View All Resources →</Link></li>
          </ul>
        </div>
        <div>
          <div className={HEADER}>Free tools</div>
          <ul className="mt-4 space-y-2.5 text-sm font-normal text-neutral-600">
            {tools.slice(0, 10).map((t) => (
              <li key={t.slug}><Link to={`/tools/${t.slug}`} className="hover:text-neutral-900">{t.name}</Link></li>
            ))}
            <li><Link to="/tools" className="font-semibold hover:text-neutral-900">All tools →</Link></li>
          </ul>
        </div>
        <div>
          <div className={HEADER}>Compare</div>
          <ul className="mt-4 space-y-2.5 text-sm font-normal text-neutral-600">
            {comparisons.map((comparison) => (
              <li key={comparison.slug}>
                <Link to={`/compare/${comparison.slug}`} className="hover:text-neutral-900">
                  {`Rocket vs ${comparison.tool}`}
                </Link>
              </li>
            ))}
            <li><Link to="/compare" className="font-semibold hover:text-neutral-900">View All →</Link></li>
          </ul>
        </div>
        <div>
          <div className={HEADER}>Connect</div>
          <div className="mt-4 flex items-center gap-3">
            <a href="https://x.com/tryrocketai" target="_blank" rel="noreferrer" aria-label="X" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900">
              <XIcon className="h-4 w-4" />
            </a>
            <a href="https://www.instagram.com/tryrocketai/" target="_blank" rel="noreferrer" aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="https://discord.gg/aSkXPHhTjJ" target="_blank" rel="noreferrer" aria-label="Discord" className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900">
              <DiscordIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
      <div className="mt-12 pt-6 text-center text-xs text-neutral-500">
        Copyright © 2026 Works App, Inc. Built with 🫶🏻 by <a href="http://x.com/alexmacgregor__/" target="_blank" rel="noreferrer" className="hover:text-neutral-900">Alex</a>.
      </div>
    </div>
  </footer>
);

export default SiteFooter;

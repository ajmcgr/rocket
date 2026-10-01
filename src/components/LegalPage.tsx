import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

type LegalPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
};

const LegalPage = ({ title, summary, children }: LegalPageProps) => (
  <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <SiteHeader />
    <main className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
      <header className="border-b border-neutral-200 pb-9 dark:border-neutral-800">
        <p className="text-sm font-semibold text-[#167ac6] dark:text-sky-300">Rocket legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">{summary}</p>
        <p className="mt-5 text-sm text-neutral-500 dark:text-neutral-400">Last updated: October 1, 2026</p>
      </header>
      <div className="mt-10 space-y-10 text-base leading-7 text-neutral-700 dark:text-neutral-300 [&_a]:font-medium [&_a]:text-[#167ac6] [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-sky-300 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-neutral-950 dark:[&_h2]:text-white [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </main>
    <SiteFooter />
  </div>
);

export default LegalPage;

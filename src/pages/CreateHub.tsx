import { Link } from "@/lib/router-compat";
import { ArrowRight, Bookmark, Layers3, LayoutTemplate, Palette, PenTool, Shapes, Sparkles, Wand2, type LucideIcon } from "lucide-react";

const tools: { title: string; description: string; to: string; icon: LucideIcon }[] = [
  { title: "Logo Designer", description: "Generate and refine logo directions.", to: "/logos", icon: Sparkles },
  { title: "Icon Designer", description: "Create icons for apps and brands.", to: "/icons", icon: Shapes },
  { title: "Wizard", description: "Build a brand direction step by step.", to: "/wizard", icon: Wand2 },
  { title: "Templates", description: "Start from an existing design.", to: "/templates", icon: LayoutTemplate },
  { title: "Saved Designs", description: "Return to your saved creative work.", to: "/saved", icon: Bookmark },
  { title: "Brand Kits", description: "Keep your brand assets together.", to: "/brands", icon: Palette },
  { title: "Editor", description: "Fine-tune and export designs.", to: "/editor", icon: PenTool },
];

export default function CreateHub() {
  return <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-14">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Rocket Create</p>
    <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">Create your brand.</h1>
    <p className="mt-4 max-w-2xl text-lg text-neutral-600">Logos, icons, and complete brand kits for the apps you build.</p>
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{tools.map(({ title, description, to, icon: Icon }) => <Link key={to} to={to} className="group flex min-h-44 flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50"><Icon className="h-6 w-6 text-sky-700" aria-hidden="true" /></span><div><h2 className="mt-5 flex items-center justify-between gap-2 text-lg font-semibold">{title}<ArrowRight className="h-4 w-4 shrink-0 text-neutral-400 group-hover:text-sky-700" /></h2><p className="mt-1 text-sm text-neutral-600">{description}</p></div></Link>)}</div>
    <div className="mt-8 flex flex-wrap gap-5 text-sm"><Link to="/designs" className="inline-flex items-center gap-2 font-medium text-neutral-600 hover:text-sky-700"><Layers3 className="h-4 w-4" /> All designs</Link><Link to="/trash" className="text-neutral-600 hover:text-sky-700">Trash</Link><Link to="/create/branding" className="text-neutral-600 hover:text-sky-700">More about Rocket Create</Link></div>
  </main>;
}

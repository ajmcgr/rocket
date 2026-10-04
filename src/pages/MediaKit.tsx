import SiteHeader from "@/components/SiteHeader";
import rocketColor from "@/assets/rocket-logo-color.png.asset.json";
import { Button } from "@/components/ui/button";

const colors = [
  { name: "Brand Blue", hex: "#1676e3", swatch: "bg-brand" },
  { name: "Ink", hex: "#0A0A0A", swatch: "bg-neutral-900" },
  { name: "Paper", hex: "#FFFFFF", swatch: "bg-white border border-neutral-200" },
  { name: "Smoke", hex: "#F5F5F5", swatch: "bg-neutral-100" },
];

const MediaKit = () => (
  <div className="min-h-screen bg-white text-neutral-900">
    <SiteHeader />
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Brand Kit</h1>
      <p className="mt-3 text-lg text-neutral-600">Logos, colors, and usage guidelines for press, partners, and reviewers.</p>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Logos</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-10">
            <img src={rocketColor.url} alt="Rocket logo on light" className="mx-auto h-20 w-auto object-contain" />
            <p className="mt-6 text-center text-xs text-neutral-500">Rocket logo · Light backgrounds</p>
            <div className="mt-4 text-center">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={rocketColor.url} download="rocket-logo.png">Download PNG</a>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-900 p-10">
            <img src={rocketColor.url} alt="Rocket logo on dark" className="mx-auto h-20 w-auto object-contain" />
            <p className="mt-6 text-center text-xs text-neutral-400">Rocket logo · Dark backgrounds</p>
            <div className="mt-4 text-center">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <a href={rocketColor.url} download="rocket-logo.png">Download PNG</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Colors</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {colors.map((c) => (
            <div key={c.hex} className="overflow-hidden rounded-2xl border border-neutral-200">
              <div className={`h-28 w-full ${c.swatch}`} />
              <div className="px-4 py-3">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-neutral-500">{c.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Usage</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-neutral-700">
          <li>Always use the official logo files — no recoloring or warping.</li>
          <li>Maintain at least 16px of clear space around the logo.</li>
          <li>"Rocket" is one word, capital R. Not ROCKET, not rocket.ai.</li>
          <li>Refer to us as "Rocket" or "tryrocket.ai" — not "Try Rocket".</li>
        </ul>
      </section>

      <section className="mt-14 rounded-2xl border border-neutral-200 bg-neutral-50 p-8">
        <h2 className="text-xl font-semibold tracking-tight">Press contact</h2>
        <p className="mt-2 text-neutral-700">For interviews, podcast invites, or partnerships:</p>
        <a href="mailto:alex@trylaunch.ai" className="mt-3 inline-block text-brand hover:underline">alex@trylaunch.ai</a>
      </section>
    </main>

  </div>
);

export default MediaKit;

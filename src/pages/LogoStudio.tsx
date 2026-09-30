import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const STYLE_OPTIONS = [
  { id: "modern", label: "Modern" },
  { id: "minimal", label: "Minimal" },
  { id: "luxury", label: "Luxury" },
  { id: "technology", label: "Technology" },
  { id: "startup", label: "Startup" },
  { id: "playful", label: "Playful" },
  { id: "vintage", label: "Vintage" },
  { id: "abstract", label: "Abstract" },
] as const;

const INDUSTRIES = [
  "SaaS", "Fintech", "AI", "Healthcare", "Consumer", "Ecommerce", "Education", "Media", "Agency", "Other",
];

const LogoStudio = () => {
  const nav = useNavigate();
  const [brand, setBrand] = useState("");
  const [slogan, setSlogan] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [style, setStyle] = useState<string>("modern");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = brand.trim();
    if (!name) return;
    const parts = [
      `A ${style} logo for ${name}`,
      industry && `in the ${industry} industry`,
      slogan && `— tagline: "${slogan.trim()}"`,
      description.trim() && description.trim(),
      website.trim() && `Website: ${website.trim()}`,
    ].filter(Boolean);
    const prompt = parts.join(". ");
    const search = new URLSearchParams({
      prompt,
      asset_type: "logo",
      count: "8",
    });
    nav(`/create?${search.toString()}`);
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.15)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_88px]">
        {/* Left: prompt / intro */}
        <div className="flex flex-col justify-center gap-4 bg-[#1676e3] p-10 text-white sm:p-12">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Wizard</h1>
          <p className="max-w-xs text-sm/6 text-white/85">
            The best brands are memorable and easy to recognize.
          </p>
        </div>

        {/* Middle: form fields */}
        <form
          onSubmit={submit}
          className="flex flex-col justify-center gap-4 bg-white p-8 sm:p-10"
        >
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand name"
            className="h-12 rounded-xl border-neutral-200 text-base"
            autoFocus
            required
          />
          <Input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="Slogan (Optional)"
            className="h-12 rounded-xl border-neutral-200 text-base"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website (optional)"
              className="h-11 rounded-xl border-neutral-200"
            />
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-hidden"
            >
              <option value="">Industry (optional)</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What do you do? (optional)"
            rows={2}
            className="rounded-xl border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {STYLE_OPTIONS.map((s) => {
              const active = style === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </form>

        {/* Right: submit rail */}
        <button
          type="button"
          onClick={(e) => submit(e as unknown as FormEvent)}
          disabled={!brand.trim()}
          aria-label="Generate logo concepts"
          className="group flex items-center justify-center bg-[#ff7a45] text-white transition hover:bg-[#f2632a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowRight className="h-8 w-8 transition group-hover:translate-x-0.5" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};

export default LogoStudio;
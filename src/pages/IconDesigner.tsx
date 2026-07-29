import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Shapes, Send, Image as ImageIcon, Shuffle, Minus, Sticker, Palette, PenTool, Box, Smile, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import ChatsPanelLayout from "@/components/ChatsPanelLayout";

const STYLES = [
  { id: "auto", label: "Auto", icon: Shuffle, suffix: "" },
  { id: "minimal", label: "Minimal", icon: Minus, suffix: "minimalist flat vector icon, clean geometric shapes, limited palette" },
  { id: "sticker", label: "Sticker", icon: Sticker, suffix: "sticker-style icon with thick bold outline and vibrant fill" },
  { id: "illustration", label: "Illustration", icon: Palette, suffix: "illustrated icon with rich color and detailed shading" },
  { id: "line-art", label: "Line Art", icon: PenTool, suffix: "monoline line-art icon, single continuous stroke, no fill" },
  { id: "3d", label: "3D/Geometric", icon: Box, suffix: "3D geometric icon with depth, gradients and soft shadows" },
  { id: "cartoon", label: "Cartoon", icon: Smile, suffix: "cartoon mascot icon with friendly expression, bold outline" },
] as const;

const EXAMPLES = [
  "A cute bear wearing glasses reading a book",
  "A cat inside a heart",
  "A minimalist yellow dog with a bone in its mouth",
  "A cartoon flying school bus with wings",
  "Purple silhouette of a woman in a dancing pose",
];

const IconDesigner = () => {
  const nav = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [autoPrompt, setAutoPrompt] = useState(true);
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"]>("auto");
  const active = STYLES.find((s) => s.id === style) || STYLES[0];
  const ActiveIcon = active.icon;

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const styleSuffix = active.suffix ? ` ${active.suffix}.` : "";
    const finalPrompt = autoPrompt
      ? `${t}. Centered, crisp, single-object icon, transparent background, no text.${styleSuffix}`
      : styleSuffix ? `${t}.${styleSuffix}` : t;
    const search = new URLSearchParams({ prompt: finalPrompt, asset_type: "icon", count: "4", from: "/icons" });
    nav(`/create?${search.toString()}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(prompt);
  };

  return (
    <ChatsPanelLayout>
    <div className="relative flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Centered hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-40 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center text-[#1676e3]">
          <Shapes className="h-10 w-10" strokeWidth={1.6} />
        </div>
        <span className="rounded-full bg-[#1676e3] px-4 py-1.5 text-sm font-medium text-white shadow-sm">
          Icon Designer
        </span>

        <p className="mt-8 text-sm text-neutral-500">Prompt Examples:</p>
        <div className="mt-3 flex max-w-3xl flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setPrompt(ex); go(ex); }}
              className="rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom composer */}
      <form
        onSubmit={submit}
        className="sticky bottom-0 left-0 right-0 border-t border-neutral-200 bg-white/95 px-4 py-4 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your icon or business/brand…"
            className="h-12 flex-1 rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none focus:border-neutral-400"
          />
          <button
            type="button"
            aria-label="Upload reference"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Style"
                className="flex h-12 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                <ActiveIcon className="h-4 w-4" /> {active.label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white">
              {STYLES.map((s) => {
                const Icon = s.icon;
                return (
                  <DropdownMenuItem key={s.id} onSelect={() => setStyle(s.id)} className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{s.label}</span>
                    {s.id === style && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="hidden items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 sm:flex">
            <input
              type="checkbox"
              checked={autoPrompt}
              onChange={(e) => setAutoPrompt(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#1676e3]"
          />
          Auto Prompt
          </label>
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[#1676e3] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d5ec5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> Generate
          </button>
        </div>
      </form>
    </div>
    </ChatsPanelLayout>
  );
};

export default IconDesigner;
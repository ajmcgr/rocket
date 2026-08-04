import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { X, ArrowRight, Sparkles } from "lucide-react";

type Step = {
  selector?: string;
  title: string;
  body: string;
  cta?: string;
  placement?: "bottom" | "right" | "left" | "center";
};

const STORAGE_KEY = "rocket.onboarding.v2";

const STEPS: Step[] = [
  {
    title: "Welcome to Rocket",
    body: "Rocket helps founders design a complete startup brand — logos, icons, palettes, fonts and a full brand kit — in minutes.",
    placement: "center",
    cta: "Start tour",
  },
  {
    selector: '[data-tour="nav-logos"]',
    title: "Design your logo",
    body: "Chat with Rocket to generate professional logo concepts. Regenerate, refine and star the ones you love.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="chats-sidebar"]',
    title: "Your chat history",
    body: "Every conversation is saved here. Jump back into a past chat, pin favourites or start a new one with the + New button.",
    placement: "right",
  },
  {
    selector: '[data-tour="nav-icons"]',
    title: "Create matching icons",
    body: "Generate app icons, favicons and symbols that complement your chosen logo.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-wizard"]',
    title: "Try the Wizard",
    body: "Answer a few questions and let Rocket generate a full brand direction for you in one go.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-templates"]',
    title: "Browse templates",
    body: "Hundreds of ready-made templates for social posts, decks, business cards and more — remix any of them in the editor.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-saved"]',
    title: "Saved designs",
    body: "Star anything you like from chat and it lands here — filter, sort and remix at any time.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-brand"]',
    title: "Build your Brand Kit",
    body: "Combine your saved logo, palette, fonts and brand book into one downloadable kit — ready for your team.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-editor"]',
    title: "Refine your designs",
    body: "Fine-tune any design in the editor — swap colours, edit text, resize and export.",
    placement: "bottom",
  },
  {
    selector: '[data-tour="nav-notifications"]',
    title: "Stay in the loop",
    body: "We'll ping you here when generations finish and when your kit is ready to download.",
    placement: "bottom",
  },
  {
    title: "You're ready",
    body: "Let's design your first logo. You can replay this tour any time from Settings.",
    placement: "center",
    cta: "Open Logo Designer",
  },
];

const PAD = 8;

const OnboardingTour = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-open once per user — but only for genuinely NEW accounts.
  // Existing users (signed up > 7 days ago) get the flag set silently so
  // they never see the tour unless they replay it from Settings.
  useEffect(() => {
    if (!user) return;
    const key = `${STORAGE_KEY}.${user.id}`;
    if (localStorage.getItem(key)) return;
    const createdAt = new Date((user as any).created_at || 0).getTime();
    const isNew = createdAt > 0 && Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000;
    if (!isNew) {
      // Mark older accounts as seen so the tour doesn't pop up retroactively.
      localStorage.setItem(key, "1");
      return;
    }
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [user]);

  // Allow programmatic re-launch
  useEffect(() => {
    const h = () => { setIdx(0); setOpen(true); };
    window.addEventListener("rocket:start-tour", h);
    return () => window.removeEventListener("rocket:start-tour", h);
  }, []);

  const step = STEPS[idx];

  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipSize, setTipSize] = useState({ width: 360, height: 220 });

  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const update = () => {
      const box = el.getBoundingClientRect();
      setTipSize((prev) =>
        Math.abs(prev.height - box.height) < 1 && Math.abs(prev.width - box.width) < 1
          ? prev
          : { width: box.width, height: box.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, idx]);

  const measure = useCallback(() => {
    if (!step?.selector) { setRect(null); return; }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (el) setRect(el.getBoundingClientRect());
    else setRect(null);
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [open, measure]);

  const finish = () => {
    if (user) localStorage.setItem(`${STORAGE_KEY}.${user.id}`, "1");
    setOpen(false);
  };

  if (!open || !step) return null;

  const last = idx === STEPS.length - 1;
  const tipStyle: React.CSSProperties = (() => {
    if (!rect || step.placement === "center") {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const margin = 16;
    const width = Math.min(360, window.innerWidth - margin * 2);
    const height = tipSize.height || 220;
    // Prefer below the target, flip above when it would overflow, then clamp.
    let top = rect.bottom + PAD;
    if (top + height + margin > window.innerHeight) {
      const above = rect.top - PAD - height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    const left = Math.min(
      window.innerWidth - width - margin,
      Math.max(margin, rect.left + rect.width / 2 - width / 2),
    );
    return { top, left, maxHeight: window.innerHeight - margin * 2, overflowY: "auto" };
  })();

  const next = () => {
    if (last) {
      finish();
      nav("/logos");
    } else setIdx(i => i + 1);
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      {/* Overlay with cut-out using SVG mask */}
      <svg className="absolute inset-0 h-full w-full pointer-events-auto" onClick={finish}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && step.placement !== "center" && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(15,23,42,0.55)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight ring */}
      {rect && step.placement !== "center" && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/90 ring-offset-2 ring-offset-transparent shadow-[0_0_0_4px_rgba(255,255,255,0.15)] transition-all"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tipRef}
        className="absolute w-[320px] sm:w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl"
        style={tipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Step {idx + 1} of {STEPS.length}
            </div>
          </div>
          <button onClick={finish} aria-label="Skip tour" className="rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-3 text-base font-semibold tracking-tight text-neutral-900">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{step.body}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === idx ? "w-5 bg-neutral-900" : i < idx ? "w-1.5 bg-neutral-400" : "w-1.5 bg-neutral-200"}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-xs font-medium text-neutral-500 hover:text-neutral-800">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && !last && (
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
                Back
              </button>
            )}
            <button
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              {step.cta || (last ? "Finish" : "Next")}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;

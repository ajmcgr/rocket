import { FileCode as ControlFileCode, Loader2 as ControlLoader2, Save as ControlSave } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LOGOTYPE_FONTS, loadGoogleFont, type LogotypeState, defaultLogotypeState } from "@/lib/logotype";
import { Logotype, logotypeToSvg, logotypeToPng } from "./Logotype";
import { Download, FileCode, Loader2, Save } from "@/components/EmojiIcons";

interface Props {
  initial: LogotypeState | null;
  defaultText: string;
  saving?: boolean;
  onSave: (state: LogotypeState) => Promise<void> | void;
}

export function LogotypeEditor({ initial, defaultText, saving, onSave }: Props) {
  const [state, setState] = useState<LogotypeState>(initial || defaultLogotypeState(defaultText));
  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(initial), [state, initial]);

  // Preload all curated fonts so the dropdown previews live.
  useEffect(() => {
    LOGOTYPE_FONTS.forEach(f => loadGoogleFont(f.family, [Math.min(...f.weights), Math.max(...f.weights)]));
  }, []);
  useEffect(() => { loadGoogleFont(state.font, [state.weight]); }, [state.font, state.weight]);

  const weights = LOGOTYPE_FONTS.find(f => f.family === state.font)?.weights || [400, 700];

  const update = (patch: Partial<LogotypeState>) => setState(s => ({ ...s, ...patch }));

  const downloadSvg = () => {
    const svg = logotypeToSvg(state);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.text.replace(/[^\w-]+/g, "_")}-logotype.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadPng = async () => {
    const dataUrl = await logotypeToPng(state, 3);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${state.text.replace(/[^\w-]+/g, "_")}-logotype.png`;
    a.click();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex min-h-[280px] items-center justify-center bg-neutral-50 px-8 py-10">
        <Logotype state={state} fontSizePx={88} />
      </div>
      <div className="grid gap-4 border-t border-neutral-100 p-5 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Text</span>
          <input
            value={state.text}
            onChange={e => update({ text: e.target.value })}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Font</span>
          <select
            value={state.font}
            onChange={e => {
              const f = LOGOTYPE_FONTS.find(x => x.family === e.target.value);
              const newWeight = f && !f.weights.includes(state.weight) ? f.weights[Math.floor(f.weights.length / 2)] : state.weight;
              update({ font: e.target.value, weight: newWeight });
            }}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
          >
            {(["sans", "serif", "display", "mono"] as const).map(cat => (
              <optgroup key={cat} label={cat.toUpperCase()}>
                {LOGOTYPE_FONTS.filter(f => f.category === cat).map(f => (
                  <option key={f.family} value={f.family} style={{ fontFamily: `'${f.family}'` }}>{f.family}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Weight</span>
          <select
            value={state.weight}
            onChange={e => update({ weight: parseInt(e.target.value) })}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
          >
            {weights.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={state.color}
              onChange={e => update({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-md border border-neutral-200 bg-white"
            />
            <input
              value={state.color}
              onChange={e => update({ color: e.target.value })}
              className="flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-sm outline-hidden focus:border-brand"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Letter spacing ({state.letterSpacing.toFixed(2)}em)</span>
          <input
            type="range" min={-0.1} max={0.3} step={0.005}
            value={state.letterSpacing}
            onChange={e => update({ letterSpacing: parseFloat(e.target.value) })}
            className="w-full"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-600">Case</span>
          <select
            value={state.transform}
            onChange={e => update({ transform: e.target.value as LogotypeState["transform"] })}
            className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
          >
            <option value="none">As typed</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
        <button onClick={downloadSvg} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100">
          <ControlFileCode className="h-4 w-4" /> SVG
        </button>
        <button onClick={downloadPng} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100">
          <Download className="h-4 w-4" /> PNG
        </button>
        <button
          onClick={() => onSave(state)}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? <ControlLoader2 className="h-4 w-4 animate-spin" /> : <ControlSave className="h-4 w-4" />} Save
        </button>
      </div>
    </div>
  );
}

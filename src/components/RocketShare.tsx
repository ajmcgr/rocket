import { useState } from "react";
import { Download, Link2, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { attributedShareUrl, shareCardUrl, shareTargets, type ShareKind, type ShareVariant } from "@/lib/shareLinks";

type Props = {
  kind: ShareKind;
  identifier: string;
  title: string;
  label?: string;
  className?: string;
  version?: string;
};

const variants: { key: ShareVariant; label: string; dimensions: string }[] = [
  { key: "landscape", label: "Landscape", dimensions: "1200 × 630" },
  { key: "square", label: "Square", dimensions: "1080 × 1080" },
  { key: "portrait", label: "Portrait", dimensions: "1080 × 1920" },
];

export default function RocketShare({ kind, identifier, title, label = "Share", className, version }: Props) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<ShareVariant>("landscape");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const url = attributedShareUrl(kind, identifier);
  const card = shareCardUrl(kind, identifier, variant, version);
  const targets = shareTargets(title, url, kind);
  const [caption, setCaption] = useState(() => targets.caption);
  const eventData = { kind, identifier };
  const copy = async (text: string, what: "link" | "caption") => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what === "link" ? "Link" : "Caption"} copied.`);
      track(what === "link" ? "share_link_copied" : "share_caption_copied", eventData);
    } catch { setNotice("Could not copy automatically."); }
  };
  const download = async () => {
    setDownloading(true);
    setNotice("");
    try {
      const response = await fetch(card);
      if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) throw new Error("Image unavailable");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `rocket-${identifier.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-${variant}-share.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      track("share_card_downloaded", { ...eventData, variant });
      if (kind === "rocket100") track("rocket100_shared", { destination: "download", identifier });
    } catch { setNotice("The image is unavailable right now. You can still copy the link."); }
    finally { setDownloading(false); }
  };
  const openTarget = (destination: string, href: string) => {
    track("share_destination_clicked", { ...eventData, destination });
    if (kind === "rocket100") track("rocket100_shared", { destination, identifier });
    window.open(href, "_blank", "noopener,noreferrer");
  };
  const nativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, url });
      track("share_native_completed", eventData);
    } catch { /* The person may cancel the native sheet. */ }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className={className || "inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-sky-300 hover:text-sky-700"} onClick={() => track("share_button_clicked", eventData)}><Share2 size={16} aria-hidden="true" />{label}</button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto p-5 sm:p-6">
      <DialogHeader><DialogTitle>Share {kind === "app" ? "this app" : kind === "profile" ? "this profile" : kind === "rocket100" ? "your Rocket 100 place" : kind === "recap" ? "your recap" : "this collection"}</DialogTitle><DialogDescription>Choose a place to share, or download a Rocket card.</DialogDescription></DialogHeader>
      <img src={card} alt={`${title} share card preview`} className="mt-3 max-h-52 w-full rounded-xl border border-neutral-200 bg-white object-contain" loading="lazy" />
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Share card format">{variants.map((item) => <button key={item.key} type="button" aria-pressed={variant === item.key} onClick={() => setVariant(item.key)} className={`min-h-11 rounded-lg border px-2 py-2 text-xs ${variant === item.key ? "border-sky-600 bg-sky-50 text-sky-900" : "border-neutral-200"}`}><span className="block font-semibold">{item.label}</span><span>{item.dimensions}</span></button>)}</div>
      {kind === "recap" && <label className="mt-4 block text-sm font-medium">Suggested caption<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full rounded-lg border border-neutral-200 p-3 text-sm font-normal" /></label>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {([ ["X", kind === "recap" ? `https://twitter.com/intent/tweet?${new URLSearchParams({ text: caption })}` : targets.x], ["LinkedIn", targets.linkedin], ["Facebook", targets.facebook], ["Reddit", targets.reddit], ["WhatsApp", targets.whatsapp], ["Telegram", targets.telegram] ] as const).map(([name, href]) => <button key={name} type="button" className="min-h-11 rounded-lg border border-neutral-200 px-3 text-sm font-medium hover:bg-neutral-50" onClick={() => openTarget(name.toLowerCase(), href)}>{name}</button>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm" onClick={() => void copy(url, "link")}><Link2 size={16} />Copy link</button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm disabled:opacity-50" disabled={downloading} onClick={() => void download()}><Download size={16} />{downloading ? "Preparing…" : "Download image"}</button>
        <button type="button" className="min-h-11 rounded-lg border border-neutral-200 px-3 text-sm" onClick={() => void copy(kind === "recap" ? caption : targets.caption, "caption")}>Copy caption</button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && <button type="button" className="min-h-11 rounded-lg border border-neutral-200 px-3 text-sm" onClick={() => void nativeShare()}>More apps…</button>}
      </div>
      <p className="mt-3 text-xs text-neutral-500">For Threads and Instagram, download the image and copy the caption to post in the app.</p>
      {notice && <p role="status" className="mt-2 text-sm text-neutral-700">{notice}</p>}
    </DialogContent>
  </Dialog>;
}

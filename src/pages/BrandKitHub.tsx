import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase as _sb } from "@/integrations/supabase/client";
import {
  ArrowLeft, Sparkles, Palette, Type, MessageSquare, Layers, Shapes, Image as ImageIcon,
  Twitter, Linkedin, Instagram, Hash, Rocket as RocketIcon, Megaphone, Newspaper, Plus, Check, Trash2, X,
  Share2, Facebook, Send, MessageCircle, MessageSquare as MessageSquareIcon, Mail, Link as LinkIcon, Lock,
  Download, Loader2, FileImage, Globe, ChevronRight, Type as TypeIcon,
  BookOpen,
} from "lucide-react";
import { downloadCompleteBrandKit } from "@/lib/brandKitDownload";
import { exportAsset } from "@/lib/exporters";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import ProjectNavigation from "@/components/ProjectNavigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const supabase = _sb as any;

// A hub "item" maps a Looka-style asset slot to a generator entry-point.
// asset_type values reuse existing Rocket types where possible; new visual
// slots fall back to the generic "graphic" generator with a tailored prompt.
type Item = {
  key: string;
  label: string;
  Icon: any;
  asset_type: string;          // what we pass to /create
  match: (a: any) => boolean;  // detect existing assets in the project
  promptHint?: string;         // seed prompt for graphic-style slots
};
type Group = { id: string; label: string; description: string; items: Item[] };

const has = (types: string[]) => (a: any) => Boolean(a) && types.includes(a.asset_type);
const titleMatch = (re: RegExp, type = "graphic") => (a: any) =>
  Boolean(a) && a.asset_type === type && typeof a.title === "string" && re.test(a.title);

const GROUPS: Group[] = [
  {
    id: "brand", label: "Brand", description: "Your visual identity foundation.",
    items: [
      { key: "logos", label: "Logos", Icon: Sparkles, asset_type: "logo", match: has(["logo"]) },
      { key: "colors", label: "Colors", Icon: Palette, asset_type: "color_system", match: has(["color_system", "design_color_palette"]) },
      { key: "typography", label: "Typography", Icon: Type, asset_type: "font_system", match: has(["font_system", "design_typography"]) },
      { key: "voice", label: "Brand Voice", Icon: MessageSquare, asset_type: "brand_voice", match: has(["brand_voice"]) },
      { key: "components", label: "Components", Icon: Layers, asset_type: "graphic", match: titleMatch(/component/i), promptHint: "UI component set (buttons, cards, inputs) using the brand palette and typography" },
      { key: "icons", label: "Icons", Icon: Shapes, asset_type: "icon", match: has(["icon"]) },
      { key: "graphics", label: "Graphics", Icon: ImageIcon, asset_type: "graphic", match: has(["graphic"]) },
      { key: "design_system", label: "Design System", Icon: Layers, asset_type: "brand_guidelines", match: has(["brand_guidelines", "design_style_direction"]) },
    ],
  },
  {
    id: "social", label: "Social", description: "Profiles, posts and stories.",
    items: [
      { key: "x_profile", label: "X Profile", Icon: Twitter, asset_type: "graphic", match: titleMatch(/x profile|twitter profile/i), promptHint: "X (Twitter) profile picture, square 400x400 logo crop on brand background" },
      { key: "x_banner", label: "X Banner", Icon: Twitter, asset_type: "graphic", match: titleMatch(/x banner|twitter banner/i), promptHint: "X (Twitter) header banner 1500x500 with product name, tagline and brand visual" },
      { key: "li_banner", label: "LinkedIn Banner", Icon: Linkedin, asset_type: "graphic", match: titleMatch(/linkedin banner/i), promptHint: "LinkedIn banner 1584x396 with product tagline and brand visual" },
      { key: "li_posts", label: "LinkedIn Posts", Icon: Linkedin, asset_type: "graphic", match: titleMatch(/linkedin post/i), promptHint: "LinkedIn post graphic 1200x1200 featuring a key product message" },
      { key: "li_carousel", label: "LinkedIn Carousels", Icon: Linkedin, asset_type: "graphic", match: titleMatch(/linkedin carousel/i), promptHint: "LinkedIn carousel slide 1080x1350, slide 1 of a 5-slide story about the product" },
      { key: "ig_posts", label: "Instagram Posts", Icon: Instagram, asset_type: "graphic", match: titleMatch(/instagram post/i), promptHint: "Instagram post 1080x1080 with bold brand visual and one-line message" },
      { key: "ig_stories", label: "Instagram Stories", Icon: Instagram, asset_type: "graphic", match: titleMatch(/instagram story|ig story/i), promptHint: "Instagram story 1080x1920 vertical, brand-led product teaser" },
      { key: "threads", label: "Threads Designs", Icon: Hash, asset_type: "graphic", match: titleMatch(/threads/i), promptHint: "Threads post graphic 1080x1080 with brand-aligned visual" },
    ],
  },
  {
    id: "launch", label: "Launch", description: "Everything you need to ship.",
    items: [
      { key: "ph_assets", label: "Product Hunt Designs", Icon: RocketIcon, asset_type: "graphic", match: titleMatch(/product hunt/i), promptHint: "Product Hunt gallery image 1270x760, bold product hero with tagline" },
      { key: "launch_assets", label: "Launch Designs", Icon: RocketIcon, asset_type: "graphic", match: titleMatch(/launch (asset|graphic|hero)/i), promptHint: "Launch hero graphic announcing the product is live, brand-led" },
      { key: "appstore_screens", label: "App Store Screenshots", Icon: ImageIcon, asset_type: "graphic", match: titleMatch(/app store screenshot/i), promptHint: "App Store screenshot 1242x2688 with device mockup and feature headline" },
      { key: "appstore_preview", label: "App Store Preview", Icon: ImageIcon, asset_type: "graphic", match: titleMatch(/app store preview/i), promptHint: "App Store preview graphic, feature-first hero with device mockup" },
      { key: "waitlist", label: "Waitlist Designs", Icon: Megaphone, asset_type: "graphic", match: titleMatch(/waitlist/i), promptHint: "Waitlist landing graphic, brand-led, with 'Join the waitlist' CTA" },
      { key: "founder_announce", label: "Founder Announcement", Icon: Megaphone, asset_type: "graphic", match: titleMatch(/founder announcement/i), promptHint: "Founder announcement post graphic, photo-friendly layout with quote space" },
      { key: "changelog", label: "Changelog Graphics", Icon: Newspaper, asset_type: "graphic", match: titleMatch(/changelog/i), promptHint: "Changelog graphic 1200x630, version badge and headline" },
      { key: "launch_copy", label: "Launch Copy", Icon: RocketIcon, asset_type: "launch_copy", match: has(["launch_copy", "launch_submission", "launch_product_hunt", "product_hunt_copy"]) },
    ],
  },
  {
    id: "marketing", label: "Marketing", description: "Ads, newsletters and landing designs.",
    items: [
      { key: "meta_ads", label: "Meta Ads", Icon: Megaphone, asset_type: "graphic", match: titleMatch(/meta ad|facebook ad|instagram ad/i), promptHint: "Meta ad creative 1080x1080, single-message brand visual with strong CTA" },
      { key: "x_ads", label: "X Ads", Icon: Twitter, asset_type: "graphic", match: titleMatch(/x ad|twitter ad/i), promptHint: "X ad creative 1200x628, brand-led with one-line value prop" },
      { key: "display_ads", label: "Display Ads", Icon: Megaphone, asset_type: "graphic", match: titleMatch(/display ad|banner ad/i), promptHint: "Display banner ad 728x90 with brand mark and CTA" },
      { key: "newsletter", label: "Newsletter Graphics", Icon: Newspaper, asset_type: "graphic", match: titleMatch(/newsletter/i), promptHint: "Newsletter header graphic 1200x400 with brand visual" },
      { key: "sponsor", label: "Sponsor Graphics", Icon: Megaphone, asset_type: "graphic", match: titleMatch(/sponsor/i), promptHint: "Sponsorship slot graphic with brand mark and one-line pitch" },
      { key: "landing", label: "Landing Page Graphics", Icon: ImageIcon, asset_type: "graphic", match: titleMatch(/landing page|landing hero/i), promptHint: "Landing page hero illustration matching the brand system" },
    ],
  },
  {
    id: "pr", label: "PR", description: "Press kit, media and founder designs.",
    items: [
      { key: "press_kit", label: "Press Kit", Icon: Newspaper, asset_type: "brand_guidelines", match: titleMatch(/press kit/i, "brand_guidelines") },
      { key: "founder_bio", label: "Founder Bio", Icon: MessageSquare, asset_type: "founder_bio", match: has(["founder_bio", "founder_tagline", "founder_story", "founder_x_bio", "founder_linkedin"]) },
      { key: "media_assets", label: "Media Designs", Icon: ImageIcon, asset_type: "graphic", match: titleMatch(/media asset|press image/i), promptHint: "Press-ready media asset 1920x1080, brand-led hero composition" },
      { key: "product_shots", label: "Product Screenshots", Icon: ImageIcon, asset_type: "graphic", match: titleMatch(/product screenshot|product shot/i), promptHint: "Polished product screenshot composition with subtle brand backdrop" },
      { key: "media_page", label: "Media Page Designs", Icon: Newspaper, asset_type: "graphic", match: titleMatch(/media page/i), promptHint: "Media page hero and logo lockup, press-friendly layout" },
    ],
  },
];

const BRAND_KIT_ESSENTIALS = [
  { key: "logo", label: "Logo", types: ["logo", "logotype", "wordmark"] },
  { key: "colours", label: "Colours", types: ["color_system", "design_color_palette"] },
  { key: "typography", label: "Typography", types: ["font_system", "design_typography"] },
  { key: "voice", label: "Brand voice", types: ["brand_voice"] },
  { key: "guidelines", label: "Guidelines", types: ["brand_guidelines", "design_style_direction"] },
];

const XLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const BrandKitHub = () => {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<string>("brand");
  const { toast } = useToast();
  const { isPro, loading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string; assetTitle?: string } | null>(null);

  const shareUrl = project?.share_token
    ? `${window.location.origin}/share/project/${project.share_token}`
    : null;

  const ensureShareToken = async () => {
    if (!id) return null;
    if (project?.share_token) return shareUrl;
    setShareBusy(true);
    const token = (crypto as any).randomUUID();
    const { error } = await supabase.from("projects").update({ share_token: token }).eq("id", id);
    if (error) {
      toast({ title: "Failed to enable sharing", description: error.message, variant: "destructive" });
      setShareBusy(false);
      return null;
    }
    setProject((prev: any) => (prev ? { ...prev, share_token: token } : prev));
    setShareBusy(false);
    return `${window.location.origin}/share/project/${token}`;
  };

  const shareText = `${project?.name || "Rocket project"}`;
  const openSocial = async (kind: "facebook" | "twitter" | "whatsapp" | "imessage" | "email" | "messenger") => {
    const url = await ensureShareToken();
    if (!url) return;
    const enc = encodeURIComponent;
    const u = enc(url);
    const t = enc(shareText);
    let target = "";
    switch (kind) {
      case "facebook": target = `https://www.facebook.com/sharer/sharer.php?u=${u}`; break;
      case "twitter": target = `https://twitter.com/intent/tweet?text=${t}&url=${u}`; break;
      case "whatsapp": target = `https://wa.me/?text=${t}%20${u}`; break;
      case "imessage": target = `sms:&body=${t}%20${url}`; break;
      case "email": target = `mailto:?subject=${enc(project?.name || "Rocket project")}&body=${t}%0A%0A${u}`; break;
      case "messenger": target = `https://www.facebook.com/dialog/send?link=${u}&app_id=140586622674265&redirect_uri=${u}`; break;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    const url = await ensureShareToken();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const nativeShare = async () => {
    const url = await ensureShareToken();
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: project?.name || "Rocket project", text: shareText, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    }
  };

  const disableShare = async () => {
    if (!id) return;
    await supabase.from("projects").update({ share_token: null }).eq("id", id);
    setProject((prev: any) => (prev ? { ...prev, share_token: null } : prev));
    toast({ title: "Public link disabled" });
  };

  const markDesignsDownloaded = async (items: any[]) => {
    const downloadedAt = new Date().toISOString();
    const results = await Promise.all(items.map((item) =>
      supabase
        .from("assets")
        .update({ meta: { ...(item.meta || {}), downloaded_at: downloadedAt } })
        .eq("id", item.id),
    ));
    if (results.some((result) => result.error)) return;
    setAssets((previous) => previous.map((item) =>
      items.some((downloadedItem) => downloadedItem.id === item.id)
        ? { ...item, meta: { ...(item.meta || {}), downloaded_at: downloadedAt } }
        : item,
    ));
  };

  const downloadZip = async () => {
    if (!id) return;
    if (!subLoading && !isPro) {
      toast({
        title: "Pro feature",
        description: "Brand kit downloads are available on the Pro plan.",
      });
      navigate("/pricing");
      return;
    }
    if (!brandKitReady) {
      toast({ title: "Complete your brand kit first", description: "Add the remaining essentials, then download the complete kit." });
      return;
    }
    setZipping(true);
    try {
      const result = await downloadCompleteBrandKit({ supabase, projectId: id, project });
      await markDesignsDownloaded(assets);
      setDownloaded(true);
      toast({
        title: "Brand kit downloaded",
        description: result.skipped.length
          ? `${result.included} files packed. See README.txt for ${result.skipped.length} skipped export${result.skipped.length === 1 ? "" : "s"}.`
          : `${result.included} files packed across Logo/Icon Files, Social Icons, Palette, Fonts, and Brand Book.`,
      });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not build ZIP.", variant: "destructive" });
    } finally {
      setZipping(false);
    }
  };

  const downloadEssential = async (asset: any) => {
    setDownloadingAssetId(asset.id);
    try {
      await exportAsset(asset, asset.image_url ? "png" : "pdf");
      await markDesignsDownloaded([asset]);
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || "Could not download this design.", variant: "destructive" });
    } finally {
      setDownloadingAssetId(null);
    }
  };

  const ShareTile = ({ Icon, label, onClick, iconClass }: any) => (
    <button
      onClick={onClick}
      disabled={shareBusy}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-3 text-center text-neutral-800 transition hover:border-brand hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass || "bg-neutral-100 text-neutral-700"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-[11px] font-medium text-neutral-800">{label}</div>
    </button>
  );
  const toggleSelect = (assetId: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(assetId) ? next.delete(assetId) : next.add(assetId);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  const bulkTrash = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} asset${ids.length === 1 ? "" : "s"} to Trash?`)) return;
    const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Moved ${ids.length} to Trash` });
    setAssets(prev => prev.filter(a => !ids.includes(a.id)));
    clearSelection();
  };

  const reload = async () => {
    if (!id) return;
    const { data } = await supabase.from("assets").select("id,title,asset_type,image_url,thumbnail_url,content,created_at,editor_state,meta").eq("project_id", id).order("created_at", { ascending: false });
    setAssets(data || []);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const { id: assetId, label } = removeTarget;
    const { error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", assetId);
    if (error) { toast({ title: "Remove failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Removed ${label} from brand kit`, description: "Moved to Trash. You can restore it anytime." });
    setAssets(prev => prev.filter(a => a.id !== assetId));
    setRemoveTarget(null);
  };

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [p, a] = await Promise.all([
        supabase.from("projects").select("*,share_token").eq("id", id).maybeSingle(),
        supabase.from("assets").select("id,title,asset_type,image_url,thumbnail_url,content,created_at,meta").eq("project_id", id).order("created_at", { ascending: false }),
      ]);
      setProject(p.data); setAssets((a.data || []).filter(Boolean)); setLoading(false);
    })();
  }, [id]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of GROUPS) c[g.id] = g.items.reduce((n, it) => n + (assets.some(it.match) ? 1 : 0), 0);
    return c;
  }, [assets]);

  const brandKitEssentials = useMemo(() => BRAND_KIT_ESSENTIALS.map((essential) => ({
    ...essential,
    asset: assets.find((asset) => asset && essential.types.includes(asset.asset_type)) || null,
  })), [assets]);
  const completeEssentialCount = brandKitEssentials.filter((essential) => essential.asset).length;
  const brandKitReady = completeEssentialCount === BRAND_KIT_ESSENTIALS.length;

  const generateHref = (it: Item) => {
    const seed = it.promptHint
      ? `${it.label} for ${project?.name || "my product"} — ${it.promptHint}`
      : `${it.label} for ${project?.name || "my product"}`;
    const qs = new URLSearchParams({ project: id || "", asset_type: it.asset_type, prompt: seed });
    return `/create?${qs.toString()}`;
  };

  if (loading) return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    </div>
  );
  if (!project) return <div className="p-10 text-center text-sm text-neutral-500">Project not found.</div>;

  const active = GROUPS.find(g => g.id === activeGroup)!;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={`/projects/${id}`} className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> {project.name}
        </Link>
        <div className="flex gap-2">
          {brandKitReady ? (
            <button
              onClick={downloadZip}
              disabled={zipping || !assets.length}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
              {!subLoading && !isPro && (
                <span className="ml-1 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Pro</span>
              )}
            </button>
          ) : (
            <Link to={`/brands?project=${id}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
              <Sparkles className="h-4 w-4" /> Complete your brand kit
            </Link>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>

      <header className="mt-4">
        <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Brand kit downloads</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{project.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">Everything for this brand, ready to organise, refine, share, or download.</p>
      </header>

      <div className="mt-6">
        <ProjectNavigation projectId={id!} active="downloads" />
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to={`/projects/${id}/logo-files`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <FileImage className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Logo/Icon Files</span>
            <span className="block text-xs text-neutral-500">Regular, Inverse, Black &amp; White — PNG, SVG, PDF.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
        <Link
          to={`/projects/${id}/websites`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <Globe className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Website Templates</span>
            <span className="block text-xs text-neutral-500">See your brand applied to ready-to-ship page layouts.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
        <Link
          to={`/projects/${id}/palettes`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <Palette className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Palette Explorer</span>
            <span className="block text-xs text-neutral-500">Preview your logo across curated color palettes.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
        <Link
          to={`/projects/${id}/fonts`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <TypeIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Font Explorer</span>
            <span className="block text-xs text-neutral-500">Try your logo across curated typefaces.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
        <Link
          to={`/projects/${id}/social`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <Megaphone className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Social Media Kit</span>
            <span className="block text-xs text-neutral-500">Ready-to-post covers, headers &amp; thumbnails.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
        <Link
          to={`/projects/${id}/guidelines`}
          className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-neutral-900">Brand Guidelines</span>
            <span className="block text-xs text-neutral-500">One-page brand book: logo, palette &amp; type.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" />
        </Link>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${brandKitReady ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-600"}`}>
                {brandKitReady ? <Check className="h-3.5 w-3.5" /> : completeEssentialCount}
              </span>
              {brandKitReady ? "Your brand kit is ready" : "Your brand kit is taking shape"}
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {brandKitReady
                ? "Your logo, colours, typography, voice and guidelines are ready to download."
                : `${completeEssentialCount} of ${BRAND_KIT_ESSENTIALS.length} brand essentials are ready. Finish the remaining pieces to complete your kit.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {brandKitReady ? (
              <button
                onClick={downloadZip}
                disabled={zipping || !assets.length}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
              >
                {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download complete brand kit
              </button>
            ) : (
              <Link to={`/brands?project=${id}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
                <Sparkles className="h-4 w-4" /> Complete your brand kit
              </Link>
            )}
            {downloaded && (
              <Link
                to={`/create?project=${id}`}
                className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Create an on-brand design
              </Link>
            )}
          </div>
        </div>
        <div className="grid divide-y border-t border-neutral-100 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {brandKitEssentials.map((essential) => (
            <div key={essential.key} className="flex min-w-0 items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-neutral-900">{essential.label}</div>
                <div className={`mt-0.5 text-[11px] ${essential.asset ? "text-emerald-700" : "text-neutral-500"}`}>
                  {essential.asset ? "Included" : "Not included yet"}
                </div>
              </div>
              {essential.asset && (
                <button
                  onClick={() => downloadEssential(essential.asset)}
                  disabled={downloadingAssetId === essential.asset.id}
                  className="shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {downloadingAssetId === essential.asset.id ? "Downloading" : "Download"}
                </button>
              )}
            </div>
          ))}
        </div>
        {downloaded && (
          <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 text-sm text-neutral-600">
            Your kit is downloaded. <Link to={`/create?project=${id}`} className="font-medium text-neutral-900 underline underline-offset-2">Create your next on-brand design</Link> to put it to work.
          </div>
        )}
      </section>

      <nav className="mt-8 flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
        {GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => setActiveGroup(g.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${activeGroup === g.id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
          >
            {g.label} <span className="ml-1 opacity-60">{counts[g.id]}/{g.items.length}</span>
          </button>
        ))}
      </nav>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-medium">{active.label}</h2>
          <p className="text-sm text-neutral-500">{active.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {active.items.map(it => {
            const existingAll = assets.filter(it.match);
            // Canonical brand-kit item: first created (oldest). Extras stay accessible via count.
            const existing = [...existingAll].sort((a, b) => +new Date(a.created_at || 0) - +new Date(b.created_at || 0));
            const preview = existing.find(a => a.image_url) || existing[0];
            const done = existing.length > 0;
            const isSelected = preview ? selected.has(preview.id) : false;
            return (
              <div key={it.key} className={`group overflow-hidden rounded-2xl border bg-white ${isSelected ? "border-brand ring-2 ring-brand/40" : "border-neutral-200"}`}>
                <div className="relative aspect-square w-full bg-neutral-50">
                  {preview && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(preview.id); }}
                      className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 transition ${isSelected ? "border-brand text-brand opacity-100" : "border-neutral-300 text-transparent opacity-0 group-hover:opacity-100"}`}
                      title={isSelected ? "Deselect" : "Select"}
                    >
                      {isSelected && <Check className="h-4 w-4" />}
                    </button>
                  )}
                  {preview?.image_url ? (
                    <img src={preview.image_url} alt={preview.title} className="h-full w-full object-cover" />
                  ) : preview?.content ? (
                    <div className="line-clamp-8 whitespace-pre-wrap p-4 text-[11px] text-neutral-600">{preview.content.slice(0, 240)}</div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-300">
                      <it.Icon className="h-10 w-10" />
                    </div>
                  )}
                  {done && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[10px] font-medium text-white">
                      <Check className="h-3 w-3" /> {existing.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-neutral-100 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <it.Icon className="h-3.5 w-3.5 text-neutral-500" /> {it.label}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {done && preview && (
                      <Link to={`/editor?id=${preview.id}`} className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] hover:bg-neutral-50" target="_blank" rel="noopener noreferrer">Edit</Link>
                    )}
                    {done && preview && (
                      <button
                        onClick={() => setRemoveTarget({ id: preview.id, label: it.label, assetTitle: preview.title })}
                        className="inline-flex items-center rounded-full border border-neutral-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50"
                        title={`Remove ${it.label} from brand kit`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <Link to={generateHref(it)} className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-medium text-brand-foreground hover:bg-brand-hover">
                      <Plus className="h-3 w-3" /> {done ? "New" : "Generate"}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-lg">
            <span className="pl-2 pr-1 text-sm font-medium">{selected.size} selected</span>
            <button onClick={bulkTrash} className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">Move to Trash</button>
            <button onClick={clearSelection} className="rounded-full px-2 py-1 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-2xl bg-white text-neutral-900 border-neutral-200">
          <DialogHeader><DialogTitle>Share “{project.name}”</DialogTitle></DialogHeader>

          {shareUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <LinkIcon className="h-3.5 w-3.5 text-emerald-600" />
              <span className="flex-1 truncate font-mono text-emerald-900">{shareUrl}</span>
              <button onClick={copyLink} className="rounded-md border border-emerald-300 bg-white px-2 py-1 hover:bg-emerald-100">Copy</button>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Share</h3>
              <button onClick={nativeShare} className="text-xs text-brand hover:underline">System share…</button>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <ShareTile Icon={LinkIcon} label="Copy link" onClick={copyLink} />
              <ShareTile Icon={XLogo} label="X" onClick={() => openSocial("twitter")} iconClass="bg-neutral-900 text-white" />
              <ShareTile Icon={Facebook} label="Facebook" onClick={() => openSocial("facebook")} iconClass="bg-blue-600 text-white" />
              <ShareTile Icon={Send} label="Messenger" onClick={() => openSocial("messenger")} iconClass="bg-gradient-to-br from-purple-500 to-pink-500 text-white" />
              <ShareTile Icon={MessageCircle} label="WhatsApp" onClick={() => openSocial("whatsapp")} iconClass="bg-green-500 text-white" />
              <ShareTile Icon={MessageSquareIcon} label="iMessage" onClick={() => openSocial("imessage")} iconClass="bg-green-400 text-white" />
              <ShareTile Icon={Mail} label="Email" onClick={() => openSocial("email")} iconClass="bg-neutral-100 text-neutral-700" />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Instagram / TikTok / YouTube don't allow direct web-share — use the system share sheet on mobile.</p>
          </div>

          {shareUrl && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-neutral-700">
                <Lock className="h-3.5 w-3.5" /> Public link is active
              </div>
              <button
                onClick={disableShare}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Disable link
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.label} from brand kit?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.assetTitle ? `"${removeTarget.assetTitle}" ` : "This asset "}
              will be moved to Trash. You can restore it from the Trash view within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-red-600 text-white hover:bg-red-700">
              Remove from brand kit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BrandKitHub;

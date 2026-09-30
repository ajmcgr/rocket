import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Palette, Plus, Loader2, Check } from "lucide-react";
import { addAssetToBrand, createBrandFromAsset, listBrandKits, type BrandableAsset } from "@/lib/brandFromAsset";

type Props = {
  asset: BrandableAsset;
  className?: string;
  onAssigned?: (projectId: string) => void;
  label?: string;
};

/**
 * Small dropdown to turn a saved asset into a brand kit or attach it to an existing brand.
 * Renders a compact icon-button trigger by default.
 */
export default function BrandFromAssetMenu({ asset, className, onAssigned, label }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await listBrandKits(user.id);
        if (!cancelled) setBrands(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, open]);

  const createNew = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setBusy(true);
    try {
      const projectId = await createBrandFromAsset(asset, { userId: user.id });
      toast({ title: "Brand kit created", description: "Opening your new brand." });
      onAssigned?.(projectId);
      navigate(`/brands/${projectId}`);
    } catch (err: any) {
      toast({ title: "Failed to create brand", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const attach = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await addAssetToBrand(asset.id, projectId);
      toast({ title: "Added to brand kit" });
      onAssigned?.(projectId);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Use in brand kit"
          className={className || "inline-flex items-center justify-center rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"}
        >
          <Palette className="h-3.5 w-3.5" />
          {label ? <span className="ml-1.5">{label}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-white" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-neutral-500">Use in brand kit</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onClick={createNew} className="cursor-pointer">
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
          Create new brand kit from this
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-neutral-400">Add to existing</DropdownMenuLabel>
        {loading ? (
          <DropdownMenuItem disabled><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</DropdownMenuItem>
        ) : brands.length === 0 ? (
          <div className="px-2 py-2 text-xs text-neutral-500">No brand kits yet.</div>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {brands.map((b) => (
              <DropdownMenuItem key={b.id} disabled={busy} onClick={(e) => attach(b.id, e as any)} className="flex items-center justify-between cursor-pointer">
                <span className="truncate">{b.name || "Untitled brand"}</span>
                {asset.project_id === b.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
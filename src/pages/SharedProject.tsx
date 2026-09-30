import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
const supabase = _sb as any;
import { Skeleton } from "@/components/ui/skeleton";
import { Logotype } from "@/components/Logotype";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const SharedProject = () => {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data: d } = await supabase.rpc("get_shared_project", { _token: token });
      setData(d);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return (
    <div className="rocket-skeleton-surface mx-auto max-w-7xl space-y-6 rounded-2xl px-6 py-10">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    </div>
  );
  if (!data?.project) return <div className="p-10 text-center text-sm text-neutral-500">This share link is invalid or has been disabled.</div>;

  const { project, assets = [] } = data;
  const cover = assets.find((a: any) => a.image_url)?.image_url || project?.brand_context?.logo || project?.brand_context?.screenshot || null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <MetaHead title={`${project.name} · Brand Kit`} description={project.description || "A brand kit built with Rocket."} image={cover} />
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">Rocket</Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
        {project.description && <p className="mt-2 text-neutral-600">{project.description}</p>}
        {assets.length === 0 ? (
          <p className="mt-10 text-sm text-neutral-500">No designs in this project yet.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a: any) => (
              <div key={a.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="aspect-square w-full bg-neutral-50">
                  {a?.editor_state?.kind === "logotype" ? <Logotype state={a.editor_state} fit="contain" /> :
                    a.image_url ? <img src={a.image_url} alt={a.title} className="h-full w-full object-cover" /> :
                    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-500"><div className="line-clamp-6 whitespace-pre-wrap">{(a.content || "").slice(0, 200)}</div></div>}
                </div>
                <div className="border-t border-neutral-100 p-3">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{a.asset_type}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-12 text-center text-xs text-neutral-400">
          Shared with <Link to="/" className="underline">Rocket</Link>
        </p>
      </main>
    </div>
  );
};

export default SharedProject;

function MetaHead({ title, description, image }: { title: string; description: string; image: string | null }) {
  useDocumentMeta({ title, description, image });
  return null;
}

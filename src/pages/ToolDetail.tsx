import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getTool } from "@/content/tools";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const ToolDetail = () => {
  const { slug } = useParams();
  const tool = slug ? getTool(slug) : null;
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useDocumentMeta({
    title: tool ? `${tool.name} — Free AI branding tool | Rocket` : "Tool not found — Rocket",
    description: tool?.description,
    canonical: tool ? `https://tryrocket.ai/tools/${tool.slug}` : undefined,
  });

  if (!tool) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">Tool not found</h1>
          <Link to="/tools" className="mt-6 inline-block text-brand hover:underline">← All tools</Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setOutput("");
    try {
      const { data, error } = await supabase.functions.invoke("free-tool", {
        body: { prompt: tool.prompt(input.trim()) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOutput((data as any).text || "");
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/tools" className="text-sm text-neutral-500 hover:text-neutral-900">← All tools</Link>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{tool.name}</h1>
        <p className="mt-3 text-lg text-neutral-600">{tool.description}</p>

        <form onSubmit={submit} className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6">
          <label className="text-sm font-medium text-neutral-900">{tool.inputLabel}</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tool.inputPlaceholder}
            rows={4}
            disabled={loading}
            className="mt-2 w-full resize-y rounded-xl border border-neutral-200 bg-white p-3 text-sm outline-none ring-brand/30 transition focus:ring-2"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Generate <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </form>

        {output && (
          <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{tool.outputLabel}</h2>
              <button
                onClick={() => { navigator.clipboard.writeText(output); toast({ title: "Copied" }); }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
            <article className="prose prose-sm prose-neutral mt-4 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </article>
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-neutral-200 bg-neutral-50 p-8 text-center">
          <h3 className="text-2xl font-semibold tracking-tight">Want the full launch kit?</h3>
          <p className="mt-2 text-neutral-600">Get all of this plus positioning, social copy, and a launch plan — in one click.</p>
          <Button asChild size="lg" className="mt-6">
            <Link to="/signup">Generate your brand <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ToolDetail;

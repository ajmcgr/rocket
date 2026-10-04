import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";
import { CONTACT_TOPICS } from "../../supabase/functions/_shared/contactValidation";

const Contact = () => {
  useDocumentMeta({
    title: "Contact Rocket",
    description: "Contact Rocket about app listings, ownership claims, accounts, billing, or partnerships.",
    canonical: "https://tryrocket.ai/contact",
  });

  const [form, setForm] = useState({ name: "", email: "", topic: CONTACT_TOPICS[0] as string, message: "", website: "" });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"success" | "error" | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setStatus(null);
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("contact-request", { body: form });
      if (error) throw error;
      setStatus("success");
      setForm({ name: "", email: "", topic: CONTACT_TOPICS[0], message: "", website: "" });
    } catch {
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Contact Rocket</h1>
          <p className="mt-4 text-lg leading-8 text-neutral-600 dark:text-neutral-300">Questions about an app, your account, or working with Rocket? Send us a note.</p>
        </header>

        <form onSubmit={submit} className="mt-10 space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:p-9">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-name" className="mb-2 block text-sm font-semibold">Name</label>
              <Input id="contact-name" autoComplete="name" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" />
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-2 block text-sm font-semibold">Email</label>
              <Input id="contact-email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <label htmlFor="contact-topic" className="mb-2 block text-sm font-semibold">What is this about?</label>
            <select id="contact-topic" value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} className="flex h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-[#167ac6] dark:border-neutral-700 dark:bg-neutral-950 dark:text-white">
              {CONTACT_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="contact-message" className="mb-2 block text-sm font-semibold">Message</label>
            <Textarea id="contact-message" required minLength={10} maxLength={4000} rows={7} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us what happened or what you need help with. Include a relevant app URL if useful." />
          </div>

          <div className="absolute -left-[10000px]" aria-hidden="true">
            <label htmlFor="contact-website">Leave this field blank</label>
            <input id="contact-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
          </div>

          <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">We use your details to reply. Please do not send passwords, API keys, or card information.</p>
          {status === "success" && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Your message has been sent. We’ll reply by email.</p>}
          {status === "error" && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">We couldn’t send your message. Please try again or email us directly.</p>}
          <Button type="submit" disabled={sending} className="min-h-11 bg-[#167ac6] text-white hover:bg-[#1268aa]">{sending ? "Sending…" : "Send message"}</Button>
        </form>

        <p className="mt-7 text-center text-sm text-neutral-600 dark:text-neutral-300">Prefer email? <a href="mailto:alex@tryrocket.ai" className="font-semibold text-[#267cbb] underline underline-offset-4 dark:text-[#80c7f4]">alex@tryrocket.ai</a></p>
      </main>

    </div>
  );
};

export default Contact;

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { agreementFields, centsFromInput, checklistTemplate, dealsDb as db, money, nextAction, statusLabel,
  type Approval, type ChecklistItem, type Deal, type Offer, type Version } from "@/lib/rocketDeals";

type Agreement = Version<{ terms: Record<string,string> }>;
type Checklist = Version<{ items: ChecklistItem[] }>;
type Message = { id: string; sender_id: string; body: string; created_at: string };
type App = { id: string; name: string; logo_url: string | null; slug: string | null };
type Profile = { user_id: string; full_name: string | null; username: string | null };
type Attachment = { id: string; object_path: string; uploader_id: string; created_at: string };
type Tab = "Overview" | "Agreement" | "Assets & Handover" | "Messages" | "Escrow";
const tabs: Tab[] = ["Overview", "Agreement", "Assets & Handover", "Messages", "Escrow"];
const inputClass = "mt-1 block min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm";
const buttonClass = "min-h-11 rounded-xl bg-[#167ac6] px-5 font-semibold text-white disabled:opacity-50";
const emptyTerms = Object.fromEntries(agreementFields.map(([key]) => [key, ""])) as Record<string,string>;

export default function DealRoom() {
  const { dealId } = useParams();
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [app, setApp] = useState<App | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [terms, setTerms] = useState<Record<string,string>>(emptyTerms);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [customAsset, setCustomAsset] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [counterConditions, setCounterConditions] = useState("");
  const [counterTimeframe, setCounterTimeframe] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!dealId || !user) return;
    const lookup = await db.from("rocket_deals").select("*").eq("id",dealId).maybeSingle();
    if (lookup.error || !lookup.data) { setError("Deal not found or access denied."); setLoading(false); return; }
    const d = lookup.data as Deal;
    const [offerRows, agreementRows, checklistRows, approvalRows, eventMessages, attachmentRows, appRow, profileRows] = await Promise.all([
      db.from("rocket_deal_offers").select("*").eq("deal_id",d.id).order("sequence",{ascending:true}),
      db.from("rocket_deal_agreements").select("*").eq("deal_id",d.id).order("version",{ascending:true}),
      db.from("rocket_deal_checklists").select("*").eq("deal_id",d.id).order("version",{ascending:true}),
      db.from("rocket_deal_approvals").select("*").eq("deal_id",d.id),
      db.from("rocket_messages").select("id,sender_id,body,created_at").eq("conversation_id",d.conversation_id).order("created_at",{ascending:true}).limit(100),
      db.from("rocket_deal_attachments").select("*").eq("deal_id",d.id).order("created_at",{ascending:false}),
      db.from("public_discoverable_apps").select("id,name,logo_url,slug").eq("id",d.app_id).maybeSingle(),
      db.from("member_public_profiles").select("user_id,full_name,username").in("user_id",[d.buyer_id,d.seller_id]),
    ]);
    if ([offerRows,agreementRows,checklistRows,approvalRows,eventMessages,attachmentRows].some((r) => r.error)) {
      setError("Deal details could not be loaded."); setLoading(false); return;
    }
    setDeal(d); setOffers(offerRows.data || []); setAgreements(agreementRows.data || []);
    setChecklists(checklistRows.data || []); setApprovals(approvalRows.data || []);
    setMessages(eventMessages.data || []); setAttachments(attachmentRows.data || []);
    setApp(appRow.data || null); setProfiles(profileRows.data || []);
    if (agreementRows.data?.length) setTerms(agreementRows.data.at(-1).terms);
    if (checklistRows.data?.length) setItems(checklistRows.data.at(-1).items);
    setLoading(false);
  }, [dealId,user]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function act(task: () => Promise<{error?: {message?: string} | null}>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await task();
      if (result.error) setError(result.error.message || "Action failed. Please try again.");
      else { setNotice(success); await refresh(); window.dispatchEvent(new Event("rocket:notifications-refresh")); }
    } catch { setError("Action failed. Please try again."); }
    setBusy(false);
  }
  async function respond(action: "accept" | "reject" | "counter" | "withdraw") {
    if (!deal) return;
    const cents = action === "counter" ? centsFromInput(counterAmount) : null;
    if (action === "counter" && cents === null) { setError("Enter a valid USD counteroffer amount."); return; }
    await act(() => db.rpc("rocket_deal_respond",{ p_deal_id:deal.id,p_action:action,p_request_id:crypto.randomUUID(),
      p_amount_cents:cents,p_message:counterMessage,p_conditions:counterConditions,p_timeframe:counterTimeframe }),
      action === "accept" ? "Offer accepted." : action === "counter" ? "Counteroffer sent." : "Offer closed.");
  }
  async function save(kind: "agreement" | "checklist") {
    if (!deal) return;
    if (kind === "checklist" && items.length === 0) { setError("Select at least one asset."); return; }
    await act(() => db.rpc("rocket_deal_save_document",{p_deal_id:deal.id,p_kind:kind,p_data:kind === "agreement" ? terms : items}),
      "New version saved. Previous approvals no longer apply.");
  }
  async function approve(kind: "agreement" | "checklist",version: number) {
    if (!deal) return;
    await act(() => db.rpc("rocket_deal_approve_document",{p_deal_id:deal.id,p_kind:kind,p_version:version}),"Approval recorded for this version.");
  }
  async function upload(file: File) {
    if (!deal || file.type !== "application/pdf" || file.size > 10*1024*1024) { setError("Choose a PDF smaller than 10 MB."); return; }
    const path = `${deal.id}/${crypto.randomUUID()}.pdf`;
    setBusy(true); setError("");
    const uploaded = await db.storage.from("rocket-deal-agreements").upload(path,file,{contentType:"application/pdf",upsert:false});
    if (uploaded.error) { setError(uploaded.error.message); setBusy(false); return; }
    await act(() => db.rpc("rocket_deal_register_agreement",{p_deal_id:deal.id,p_path:path}),"Signed agreement uploaded privately.");
  }
  async function download(path: string) {
    const result = await db.storage.from("rocket-deal-agreements").createSignedUrl(path,60);
    if (result.error || !result.data?.signedUrl) { setError("Agreement could not be opened."); return; }
    window.open(result.data.signedUrl,"_blank","noopener,noreferrer");
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!deal || !draft.trim()) return;
    await act(() => db.rpc("send_rocket_message",{p_conversation_id:deal.conversation_id,p_body:draft,p_client_message_id:crypto.randomUUID()}),"Message sent.");
    setDraft("");
  }
  const party = (id: string) => { const p = profiles.find((row) => row.user_id===id); return p?.username ? `@${p.username}` : p?.full_name || "Rocket member"; };
  if (loading) return <main className="mx-auto max-w-5xl p-6">Loading deal…</main>;
  if (!deal) return <main className="mx-auto max-w-5xl p-6"><p role="alert">{error || "Deal not found."}</p><Link to="/deals" className="text-sky-700 underline">My Deals</Link></main>;
  const last = offers.at(-1), agreement = agreements.at(-1), checklist = checklists.at(-1);
  const canRespond = (deal.status === "offer_pending" || deal.status === "negotiating") && !!last;
  const isSeller = user?.id === deal.seller_id;
  const ownAgreementApproval = agreement && approvals.some((a) => a.kind==="agreement" && a.version===agreement.version && a.user_id===user?.id);
  const ownChecklistApproval = checklist && approvals.some((a) => a.kind==="checklist" && a.version===checklist.version && a.user_id===user?.id);
  const countApprovals = (kind: "agreement" | "checklist", version: number) => approvals.filter((a) => a.kind===kind && a.version===version).length;
  const preparation = ["offer_accepted","preparing_terms","awaiting_approvals","terms_agreed","awaiting_escrow"].includes(deal.status);
  const agreed = countApprovals("agreement",agreement?.version || 0)===2;
  const checklistAgreed = countApprovals("checklist",checklist?.version || 0)===2;
  const unsavedTerms = !!agreement && JSON.stringify(terms) !== JSON.stringify(agreement.terms);
  const unsavedChecklist = !!checklist && JSON.stringify(items) !== JSON.stringify(checklist.items);
  return <main className="mx-auto max-w-6xl px-4 py-7 text-neutral-900 sm:px-6">
    <Link to="/deals" className="text-sm text-sky-700">← My Deals</Link>
    <header className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7">
      <div className="flex items-center gap-4">{app?.logo_url && <img src={app.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />}
        <div><h1 className="text-2xl font-bold sm:text-3xl">{app?.name || "App"}</h1><p className="text-sm text-neutral-600">{statusLabel(deal.status)}</p></div></div>
      <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><p><strong>Buyer:</strong> {party(deal.buyer_id)}</p><p><strong>Seller:</strong> {party(deal.seller_id)}</p>
        <p><strong>Proposed price:</strong> {last ? money(last.amount_cents,last.currency) : "—"}</p><p><strong>Next:</strong> {nextAction(deal,user?.id || "",offers,agreements,checklists,approvals)}</p></div>
    </header>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <nav aria-label="Deal sections" className="mt-6 flex gap-2 overflow-x-auto pb-2">{tabs.map((name) => <button key={name} type="button" onClick={() => setTab(name)} aria-current={tab===name ? "page" : undefined}
      className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium ${tab===name ? "border-sky-600 bg-sky-50 text-sky-700" : "border-neutral-200 bg-white"}`}>{name}</button>)}</nav>
    <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-7">
      {tab==="Overview" && <><h2 className="text-xl font-semibold">Offer history</h2>
        <ol className="mt-4 space-y-3">{offers.map((offer) => <li key={offer.id} className="rounded-xl border border-neutral-200 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>{party(offer.actor_id)} offered {money(offer.amount_cents,offer.currency)}</strong><time className="text-neutral-500">{new Date(offer.created_at).toLocaleString()}</time></div>
          {offer.message && <p className="mt-2 whitespace-pre-wrap">{offer.message}</p>}{offer.conditions && <p className="mt-2 whitespace-pre-wrap">Conditions: {offer.conditions}</p>}
          {offer.handover_timeframe && <p className="mt-2">Handover: {offer.handover_timeframe}</p>}</li>)}</ol>
        {canRespond && <div className="mt-6 border-t pt-5"><h3 className="font-semibold">Respond to latest offer</h3>
          {last?.actor_id!==user?.id ? <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className={buttonClass} onClick={() => void respond("accept")}>Accept offer</button>
            <button disabled={busy} className="min-h-11 rounded-xl border px-5" onClick={() => void respond("reject")}>Reject</button></div> : isSeller ? <p className="mt-2 text-sm text-neutral-600">Waiting for buyer response.</p> : <button disabled={busy} className="mt-3 min-h-11 rounded-xl border px-5" onClick={() => void respond("withdraw")}>Withdraw offer</button>}
          {last?.actor_id!==user?.id && <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm">Counteroffer ({last.currency})<input value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} inputMode="decimal" className={inputClass} /></label>
            <label className="text-sm">Handover timeframe<input value={counterTimeframe} onChange={(e) => setCounterTimeframe(e.target.value)} maxLength={200} className={inputClass} /></label>
            <label className="text-sm">Message<textarea value={counterMessage} onChange={(e) => setCounterMessage(e.target.value)} maxLength={2000} className={inputClass} /></label>
            <label className="text-sm">Conditions<textarea value={counterConditions} onChange={(e) => setCounterConditions(e.target.value)} maxLength={2000} className={inputClass} /></label>
            <button disabled={busy} className={`${buttonClass} sm:col-span-2 sm:justify-self-start`} onClick={() => void respond("counter")}>Send counteroffer</button></div>}
        </div>}</>}
      {tab==="Agreement" && <><h2 className="text-xl font-semibold">Transaction terms</h2>
        <p className="mt-2 text-sm text-neutral-600">This is a Rocket deal summary, not a signed or legally executed purchase agreement. Agreeing here does not move money or transfer assets.</p>
        <p className="mt-3 text-sm">{app?.name} · {party(deal.buyer_id)} buying from {party(deal.seller_id)} · {last && money(last.amount_cents,last.currency)}</p>
        {preparation ? <><div className="mt-5 grid gap-4 sm:grid-cols-2">{agreementFields.map(([key,label]) => <label key={key} className="text-sm font-medium">{label}<textarea value={terms[key] || ""} onChange={(e) => setTerms({...terms,[key]:e.target.value})} maxLength={3000} rows={3} className={inputClass} /></label>)}</div>
          <div className="mt-5 flex flex-wrap items-center gap-3"><button disabled={busy} onClick={() => void save("agreement")} className={buttonClass}>Save new version</button>
            {agreement && <span className="text-sm">Version {agreement.version} · {countApprovals("agreement",agreement.version)}/2 approved</span>}
            {agreement && !ownAgreementApproval && <button disabled={busy || unsavedTerms} onClick={() => void approve("agreement",agreement.version)} className="min-h-11 rounded-xl border border-sky-600 px-5 font-semibold text-sky-700 disabled:opacity-50">Approve version {agreement.version}</button>}</div>
          <p className="mt-3 text-xs text-neutral-500">Editing creates a new version and invalidates approval of previous versions.</p>
          <div className="mt-6 border-t pt-5"><h3 className="font-semibold">Your signed agreement</h3><p className="mt-1 text-sm text-neutral-600">Upload your own signed PDF if you have one. Rocket does not generate or execute legal agreements.</p>
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => { const file=e.target.files?.[0]; if(file) void upload(file); }} className="mt-3 block max-w-full text-sm" />
            {attachments.map((attachment) => <button key={attachment.id} onClick={() => void download(attachment.object_path)} className="mt-3 block text-sm text-sky-700 underline">Signed PDF uploaded by {party(attachment.uploader_id)} · {new Date(attachment.created_at).toLocaleDateString()}</button>)}</div>
        </> : <p className="mt-4 text-sm text-neutral-600">Accept an offer to prepare terms.</p>}</>}
      {tab==="Assets & Handover" && <><h2 className="text-xl font-semibold">Assets & Handover</h2><p className="mt-2 text-sm text-neutral-600">The seller selects included assets. Third-party accounts may require migration, recreation, or provider approval. Customer records require legal and privacy review.</p>
        {preparation ? <><div className="mt-5 grid gap-2 sm:grid-cols-2">{checklistTemplate.map((template) => {
          const selected=items.some((i) => i.name===template.name);
          return <label key={template.name} className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" disabled={!isSeller} checked={selected} onChange={(e) => setItems(e.target.checked ? [...items,template] : items.filter((i) => i.name!==template.name))} />{template.name}</label>;
        })}</div>
          {isSeller && <div className="mt-4 flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm">Other asset<input value={customAsset} onChange={(e) => setCustomAsset(e.target.value)} maxLength={150} className={inputClass} /></label>
            <button type="button" disabled={!customAsset.trim() || items.length>=60} onClick={() => { if (!items.some((item) => item.name===customAsset.trim())) setItems([...items,{...checklistTemplate[0],name:customAsset.trim(),delivery_method:"other"}]); setCustomAsset(""); }} className="self-end min-h-11 rounded-xl border px-4 disabled:opacity-50">Add asset</button></div>}
          <div className="mt-5 space-y-4">{items.map((item,index) => <div key={`${item.name}-${index}`} className="rounded-xl border border-neutral-200 p-4"><h3 className="font-medium">{item.name}</h3>
            {isSeller && !checklistTemplate.some((template) => template.name===item.name) && <button type="button" onClick={() => setItems(items.filter((_,n) => n!==index))} className="mt-1 text-xs text-red-700 underline">Remove asset</button>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{(["description","acceptance_criteria","notes"] as const).map((field) => <label key={field} className="text-sm">{field.replaceAll("_"," ")}<input disabled={!isSeller} value={item[field]} onChange={(e) => setItems(items.map((row,n) => n===index ? {...row,[field]:e.target.value} : row))} maxLength={1000} className={inputClass} /></label>)}
              <label className="text-sm">Responsible party<select disabled={!isSeller} value={item.responsible_party} onChange={(e) => setItems(items.map((row,n) => n===index ? {...row,responsible_party:e.target.value as "buyer"|"seller"} : row))} className={inputClass}><option value="seller">Seller</option><option value="buyer">Buyer</option></select></label>
              <label className="text-sm">Delivery method<select disabled={!isSeller} value={item.delivery_method} onChange={(e) => setItems(items.map((row,n) => n===index ? {...row,delivery_method:e.target.value as ChecklistItem["delivery_method"]} : row))} className={inputClass}>
                <option value="ownership_transfer">Ownership transfer</option><option value="project_migration">Project migration</option><option value="account_recreation">Account recreation</option><option value="provider_approval">Provider approval</option><option value="document">Document</option><option value="other">Other agreed method</option><option value="not_applicable">Not applicable</option></select></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!isSeller} checked={item.required} onChange={(e) => setItems(items.map((row,n) => n===index ? {...row,required:e.target.checked} : row))} />Required</label></div></div>)}</div>
          <div className="mt-5 flex flex-wrap items-center gap-3">{isSeller && <button disabled={busy || !items.length} onClick={() => void save("checklist")} className={buttonClass}>Save new checklist version</button>}
            {checklist && <span className="text-sm">Version {checklist.version} · {countApprovals("checklist",checklist.version)}/2 approved</span>}
            {checklist && !ownChecklistApproval && <button disabled={busy || unsavedChecklist} onClick={() => void approve("checklist",checklist.version)} className="min-h-11 rounded-xl border border-sky-600 px-5 font-semibold text-sky-700 disabled:opacity-50">Approve version {checklist.version}</button>}</div>
          <p className="mt-3 text-xs text-neutral-500">Do not place passwords, API keys, or customer records in checklist notes or messages.</p>
        </> : <p className="mt-4 text-sm text-neutral-600">Accept an offer to prepare a checklist.</p>}</>}
      {tab==="Messages" && <><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Messages</h2><Link to={`/inbox?conversation=${deal.conversation_id}`} className="text-sm text-sky-700 underline">Open in Inbox</Link></div>
        <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">{messages.map((message) => <div key={message.id} className={`max-w-[90%] rounded-xl p-3 text-sm sm:max-w-[75%] ${message.sender_id===user?.id ? "ml-auto bg-sky-100" : "bg-neutral-100"}`}><strong>{party(message.sender_id)}</strong><p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p><time className="mt-1 block text-xs text-neutral-500">{new Date(message.created_at).toLocaleString()}</time></div>)}</div>
        <form onSubmit={(e) => void sendMessage(e)} className="mt-5 flex gap-2 border-t pt-4"><textarea required value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={2} placeholder="Message the other party…" className={`${inputClass} flex-1`} /><button disabled={busy || !draft.trim()} className={buttonClass}>Send</button></form>
        <p className="mt-2 text-xs text-neutral-500">Messages use your existing private Rocket Inbox. Never send secrets or customer records here.</p></>}
      {tab==="Escrow" && <><h2 className="text-xl font-semibold">Escrow Setup Required</h2><p className="mt-3 max-w-2xl text-sm text-neutral-700">Both parties have agreed on the proposed transaction terms. Payment must be arranged through an approved third-party escrow provider before asset handover begins.</p>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><p><strong>Purchase price:</strong> {last ? money(last.amount_cents,last.currency) : "—"}</p>
          <p><strong>Agreement:</strong> {agreed ? "Both approved" : `${agreement ? countApprovals("agreement",agreement.version) : 0}/2 approved`}</p>
          <p><strong>Handover checklist:</strong> {checklistAgreed ? "Both approved" : `${checklist ? countApprovals("checklist",checklist.version) : 0}/2 approved`}</p>
          <p><strong>Escrow status:</strong> Not initiated</p></div>
        {deal.status==="terms_agreed" && agreed && checklistAgreed && <button disabled={busy} onClick={() => void act(() => db.rpc("rocket_deal_prepare_escrow",{p_deal_id:deal.id}),"Deal is ready for third-party escrow setup.")} className={`${buttonClass} mt-5`}>Mark preparation complete</button>}
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Rocket does not currently hold or secure transaction funds. Do not begin asset handover until an approved third-party escrow provider confirms funding outside Rocket.</p></>}
    </section>
  </main>;
}

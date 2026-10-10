import { getAdmin, getRocketUser, json } from "../_shared/rocketConnect.ts";

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const html = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const admin = getAdmin();
const resendHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });

async function resendSuppressed(address: string, key: string) {
  const response = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(address)}`, {
    headers: resendHeaders(key),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("Resend suppression lookup unavailable");
  return true;
}

async function owner(appId: string, userId: string) {
  const { data, error } = await admin.from("app_owners").select("verification_level")
    .eq("app_id", appId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (error) throw new Error("Ownership lookup unavailable");
  return data?.verification_level === "domain_verified";
}

async function developer(userId: string) {
  const { data, error } = await admin.from("rocket_developer_memberships")
    .select("status,current_period_end").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Membership lookup unavailable");
  return data?.status === "active" && new Date(data.current_period_end).getTime() > Date.now();
}

async function programme(appId: string) {
  const { data, error } = await admin.from("rocket_beta_programs").select("*").eq("app_id", appId).maybeSingle();
  if (error) throw new Error("Beta lookup unavailable");
  return data;
}

async function sendEmail(membership: { id: string; user_id: string }, kind: "joined" | "approved" | "update", subject: string, message: string, appName: string, appId: string, updateId?: string) {
  if (kind === "update") {
    const eligibility = await admin.from("rocket_beta_memberships").select("status,updates_opt_in")
      .eq("id", membership.id).eq("user_id", membership.user_id).maybeSingle();
    if (eligibility.error || !eligibility.data || !eligibility.data.updates_opt_in ||
      !["waitlisted", "approved"].includes(eligibility.data.status)) return "suppressed";
  }
  const key = updateId ? `${updateId}/${membership.id}` : `${kind}/${membership.id}`;
  const { data: reserved, error: reserveError } = await admin.from("rocket_beta_email_deliveries")
    .insert({ membership_id: membership.id, update_id: updateId || null, kind, status: "reserved" }).select("id").single();
  if (reserveError || !reserved) return "already_reserved";
  let status: "sent" | "suppressed" | "failed" = "failed";
  let resendId: string | null = null;
  try {
    const { data: identity, error: identityError } = await admin.auth.admin.getUserById(membership.user_id);
    if (identityError || !identity.user?.email || !identity.user.email_confirmed_at) status = "suppressed";
    else {
      const address = identity.user.email.trim().toLowerCase();
      const { data: suppressed, error: suppressionError } = await admin.from("rocket_outreach_suppressions")
        .select("email").eq("email", address).maybeSingle();
      if (suppressionError) throw new Error("Suppression lookup unavailable");
      if (suppressed) status = "suppressed";
      else {
        const keyValue = Deno.env.get("RESEND_API_KEY");
        if (!keyValue) throw new Error("Email unavailable");
        if (await resendSuppressed(address, keyValue)) {
          status = "suppressed";
        } else {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${keyValue}`, "Content-Type": "application/json", "Idempotency-Key": `rocket-beta/${key}` },
          body: JSON.stringify({
            from: (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, ""),
            to: [address],
            subject,
            tags: [{ name: "category", value: "rocket_beta" }],
            html: `<div style="font-family:system-ui,sans-serif;max-width:600px"><h1>${html(appName)}</h1><p>${html(message).replace(/\n/g, "<br>")}</p><p><a href="https://tryrocket.ai/apps/${appId}">View app and manage Beta updates</a></p></div>`,
          }),
        });
        if (!response.ok) throw new Error(`Email rejected (${response.status})`);
        resendId = (await response.json()).id || null;
        status = "sent";
        }
      }
    }
  } catch (error) { console.error("Beta email failed", error); }
  await admin.from("rocket_beta_email_deliveries").update({ status, resend_id: resendId }).eq("id", reserved.id);
  return status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (!uuid(body.app_id) || typeof body.action !== "string") return json({ error: "Invalid request" }, 400);
    const appId = body.app_id as string;
    const user = await getRocketUser(req);
    const beta = await programme(appId);
    if (body.action === "public_status") {
      const active = Boolean(beta?.is_active && await developer(beta.created_by) && await owner(appId, beta.created_by));
      let membership = null;
      if (active && user) {
        const result = await admin.from("rocket_beta_memberships").select("status,joined_at,updates_opt_in")
          .eq("program_id", beta.id).eq("user_id", user.id).maybeSingle();
        if (result.error) throw new Error("Membership lookup unavailable");
        membership = result.data;
      }
      return json({ active, title: active ? beta.title : null, message: active ? beta.message : null,
        access_type: active ? beta.access_type : null, membership });
    }
    if (!user) return json({ error: "Sign in to use Rocket Beta" }, 401);
    if (body.action === "join") {
      if (!beta?.is_active || !(await developer(beta.created_by)) || !(await owner(appId, beta.created_by))) return json({ error: "This beta is not accepting testers" }, 409);
      const existing = await admin.from("rocket_beta_memberships").select("id,status")
        .eq("program_id", beta.id).eq("user_id", user.id).maybeSingle();
      if (existing.error) throw new Error("Membership lookup unavailable");
      if (existing.data?.status && existing.data.status !== "left") return json({ status: existing.data.status });
      const result = existing.data
        ? await admin.from("rocket_beta_memberships").update({ status: "waitlisted", joined_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", existing.data.id).select("id,user_id").single()
        : await admin.from("rocket_beta_memberships").insert({ program_id: beta.id, user_id: user.id, status: "waitlisted" }).select("id,user_id").single();
      if (result.error) throw new Error("Could not join beta");
      const name = (await admin.from("public_apps").select("name").eq("id", appId).maybeSingle()).data?.name || "this app";
      await sendEmail(result.data, "joined", `You're on the ${name} beta waitlist`, "You joined the beta waitlist. The developer will contact you if access is approved.", name, appId);
      return json({ status: "waitlisted" });
    }
    if (body.action === "leave" || body.action === "feedback" || body.action === "update_preferences") {
      if (!beta) return json({ error: "Beta unavailable" }, 404);
      const { data: member, error } = await admin.from("rocket_beta_memberships").select("id,status")
        .eq("program_id", beta.id).eq("user_id", user.id).maybeSingle();
      if (error || !member || !["waitlisted", "approved"].includes(member.status)) return json({ error: "Active beta membership required" }, 403);
      if (body.action === "leave") {
        const result = await admin.from("rocket_beta_memberships").update({ status: "left", updated_at: new Date().toISOString() }).eq("id", member.id);
        if (result.error) throw new Error("Could not leave beta");
        return json({ status: "left" });
      }
      if (body.action === "update_preferences") {
        if (typeof body.updates_opt_in !== "boolean") return json({ error: "Invalid preference" }, 400);
        const updated = await admin.from("rocket_beta_memberships").update({ updates_opt_in: body.updates_opt_in, updated_at: new Date().toISOString() }).eq("id", member.id);
        if (updated.error) throw new Error("Could not update preference");
        return json({ updates_opt_in: body.updates_opt_in });
      }
      const category = body.category;
      const feedback = clean(body.feedback, 2000);
      if (!["bug", "idea", "other"].includes(category) || feedback.length < 5 || feedback.length > 2000) return json({ error: "Invalid feedback" }, 400);
      const { count, error: countError } = await admin.from("rocket_beta_feedback").select("id", { count: "exact", head: true })
        .eq("membership_id", member.id).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
      if (countError || (count || 0) >= 5) return json({ error: "Feedback limit reached. Try again tomorrow." }, 429);
      const inserted = await admin.from("rocket_beta_feedback").insert({ membership_id: member.id, category, body: feedback });
      if (inserted.error) throw new Error("Could not save feedback");
      return json({ ok: true });
    }
    if (!(await owner(appId, user.id))) return json({ error: "Verified app ownership required" }, 403);
    if (beta && beta.created_by !== user.id) return json({ error: "This beta belongs to a previous app owner" }, 403);
    if (body.action === "dashboard") {
      if (!(await developer(user.id))) return json({ error: "Active Rocket Developer membership required" }, 403);
      const eligible = beta
        ? await admin.from("rocket_beta_memberships").select("id", { count: "exact", head: true })
          .eq("program_id", beta.id).eq("updates_opt_in", true).in("status", ["waitlisted", "approved"])
        : { count: 0, error: null };
      if (eligible.error) throw new Error("Recipient count unavailable");
      const { data: members, error: membersError } = beta
        ? await admin.from("rocket_beta_memberships").select("id,user_id,status,joined_at,updates_opt_in").eq("program_id", beta.id).order("joined_at", { ascending: false }).limit(200)
        : { data: [], error: null };
      if (membersError) throw new Error("Tester list unavailable");
      const { data: feedback, error: feedbackError } = beta
        ? await admin.from("rocket_beta_feedback").select("id,membership_id,category,body,created_at").in("membership_id", (members || []).map((m) => m.id).length ? (members || []).map((m) => m.id) : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(100)
        : { data: [], error: null };
      if (feedbackError) throw new Error("Feedback unavailable");
      const ids = (members || []).map((m) => m.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await admin.from("profiles").select("user_id,email,handle").in("user_id", ids)
        : { data: [], error: null };
      if (profileError) throw new Error("Tester profiles unavailable");
      const profilesById = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
      const testers = (members || []).map((m) => {
        const profile = profilesById.get(m.user_id);
        return { id: m.id, user_id: m.user_id, email: profile?.email || profile?.handle || "Rocket user", status: m.status, joined_at: m.joined_at, updates_opt_in: m.updates_opt_in };
      });
      const memberIds = (members || []).map((m) => m.id);
      const { data: deliveries, error: deliveryError } = memberIds.length
        ? await admin.from("rocket_beta_email_deliveries").select("id,membership_id,kind,status,created_at")
          .in("membership_id", memberIds).order("created_at", { ascending: false }).limit(25)
        : { data: [], error: null };
      if (deliveryError) throw new Error("Beta delivery status unavailable");
      return json({ programme: beta, testers, feedback, developer_active: true,
        deliveries, eligible_count: eligible.count || 0, tester_list_limited: (members || []).length === 200 });
    }
    if (!(await developer(user.id))) return json({ error: "Active Rocket Developer membership required" }, 403);
    if (body.action === "refresh_delivery") {
      if (!beta || !uuid(body.delivery_id)) return json({ error: "Invalid delivery" }, 400);
      const { data: delivery, error: deliveryError } = await admin.from("rocket_beta_email_deliveries")
        .select("id,membership_id,resend_id,status").eq("id", body.delivery_id).maybeSingle();
      if (deliveryError || !delivery) return json({ error: "Delivery unavailable" }, 404);
      const { data: recipient, error: recipientError } = await admin.from("rocket_beta_memberships")
        .select("user_id").eq("id", delivery.membership_id).eq("program_id", beta.id).maybeSingle();
      if (recipientError || !recipient) return json({ error: "Delivery unavailable" }, 404);
      if (!delivery.resend_id) return json({ status: delivery.status });
      const keyValue = Deno.env.get("RESEND_API_KEY");
      if (!keyValue) throw new Error("Email status unavailable");
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(delivery.resend_id)}`, {
        headers: resendHeaders(keyValue),
      });
      if (!response.ok) throw new Error("Email status unavailable");
      const email = await response.json();
      const { data: identity, error: identityError } = await admin.auth.admin.getUserById(recipient.user_id);
      const recipientEmail = identity.user?.email?.toLowerCase();
      if (identityError || !recipientEmail || email.id !== delivery.resend_id ||
        !email.to?.some((address: string) => address.toLowerCase() === recipientEmail) ||
        !email.tags?.some((tag: { name: string; value: string }) => tag.name === "category" && tag.value === "rocket_beta")) {
        throw new Error("Email status mismatch");
      }
      const event = String(email.last_event || "");
      const status = event === "delivered" || event === "opened" || event === "clicked" ? "delivered"
        : event === "bounced" || event === "complained" || event === "suppressed" ? event
        : event === "failed" ? "failed" : delivery.status;
      if (status !== delivery.status) {
        const recorded = await admin.from("rocket_beta_email_events").upsert({
          provider_event_id: `${delivery.resend_id}:${event}`, delivery_id: delivery.id,
          event_type: `email.${event}`,
        }, { onConflict: "provider_event_id", ignoreDuplicates: true });
        if (recorded.error) throw new Error("Email status recording failed");
        const updated = await admin.from("rocket_beta_email_deliveries").update({ status }).eq("id", delivery.id);
        if (updated.error) throw new Error("Email status recording failed");
        if (["bounced", "complained", "suppressed"].includes(status) &&
          await resendSuppressed(recipientEmail, keyValue)) {
          const suppressed = await admin.from("rocket_outreach_suppressions").upsert({
            email: recipientEmail, reason: status,
          }, { onConflict: "email", ignoreDuplicates: true });
          if (suppressed.error) throw new Error("Email suppression recording failed");
        }
      }
      return json({ status });
    }
    if (body.action === "configure") {
      const title = clean(body.title, 100), message = clean(body.message, 500);
      const capacity = body.capacity === null || body.capacity === "" ? null : Number(body.capacity);
      if (title.length < 3 || title.length > 100 || message.length > 500 || !["open_waitlist", "approval_required"].includes(body.access_type) ||
        (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)) || typeof body.is_active !== "boolean") return json({ error: "Invalid beta settings" }, 400);
      const { data, error } = await admin.from("rocket_beta_programs").upsert({
        app_id: appId, title, message, capacity, access_type: body.access_type, is_active: body.is_active,
        created_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: "app_id" }).select("*").single();
      if (error) throw new Error("Could not save beta settings");
      return json({ programme: data });
    }
    if (!beta) return json({ error: "Beta is not configured" }, 404);
    if (body.action === "set_status") {
      if (!uuid(body.membership_id) || !["approved", "declined", "left"].includes(body.status)) return json({ error: "Invalid tester status" }, 400);
      const { data: target } = await admin.from("rocket_beta_memberships").select("id,user_id,status")
        .eq("id", body.membership_id).eq("program_id", beta.id).maybeSingle();
      if (!target) return json({ error: "Tester unavailable" }, 404);
      const result = await admin.rpc("rocket_beta_change_tester_status", {
        p_program_id: beta.id, p_membership_id: target.id, p_status: body.status,
      });
      if (result.error) return json({ error: result.error.message || "Could not update tester" }, 409);
      let email_status = null;
      if (body.status === "approved" && target.status !== "approved") {
        const name = (await admin.from("public_apps").select("name").eq("id", appId).maybeSingle()).data?.name || "this app";
        email_status = await sendEmail(target, "approved", `Your ${name} beta access was approved`, "The developer approved your beta request. Check the app's website for next steps; Rocket does not automatically grant external app access.", name, appId);
      }
      return json({ status: body.status, email_status });
    }
    if (body.action === "send_update") {
      if (!beta.is_active) return json({ error: "Enable Beta before sending updates" }, 409);
      const subject = clean(body.subject, 120), message = clean(body.message, 2000);
      if (subject.length < 3 || subject.length > 120 || message.length < 10 || message.length > 2000) return json({ error: "Invalid update" }, 400);
      const { data: recipients, error: recipientError } = await admin.from("rocket_beta_memberships").select("id,user_id,status")
        .eq("program_id", beta.id).eq("updates_opt_in", true).in("status", ["waitlisted", "approved"]).limit(51);
      if (recipientError) throw new Error("Recipients unavailable");
      if ((recipients || []).length > 50) return json({ error: "This beta has too many recipients for V1 updates" }, 409);
      const { data: update, error } = await admin.from("rocket_beta_updates").insert({ program_id: beta.id, created_by: user.id, subject, body: message })
        .select("id").single();
      if (error) return json({ error: "One beta update per UTC day is allowed" }, 429);
      const name = (await admin.from("public_apps").select("name").eq("id", appId).maybeSingle()).data?.name || "this app";
      const delivery: string[] = [];
      for (let offset = 0; offset < (recipients || []).length; offset += 5) {
        delivery.push(...await Promise.all((recipients || []).slice(offset, offset + 5)
          .map((m) => sendEmail(m, "update", `${name}: ${subject}`, message, name, appId, update.id))));
      }
      return json({ sent: delivery.filter((status) => status === "sent").length,
        suppressed: delivery.filter((status) => status === "suppressed").length,
        failed: delivery.filter((status) => status === "failed").length });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Rocket Beta request failed", error);
    return json({ error: "Rocket Beta is temporarily unavailable" }, 503);
  }
});

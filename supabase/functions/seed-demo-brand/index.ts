import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brandbear demo brand kit — cloned into every new account so /saved and /brands
// show a realistic example on first login.
const SOURCE_PROJECT_ID = "756826d1-4e3c-4e5e-8b4a-1ddd8c65c921";

const ALLOWED_ORIGINS = [
  "https://tryrocket.ai",
  "https://www.tryrocket.ai",
  "https://tryrocket.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401, headers);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401, headers);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Idempotency: skip if this user already has the demo cloned, OR already
    // has any projects/assets of their own.
    const { data: existingDemo } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .contains("meta", { demo_source: SOURCE_PROJECT_ID })
      .limit(1);
    if (existingDemo && existingDemo.length > 0) {
      return json({ status: "already_seeded" }, 200, headers);
    }

    const { count: existingCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((existingCount || 0) > 0) {
      return json({ status: "user_has_projects" }, 200, headers);
    }

    // Load source project + assets using service role.
    const { data: srcProject, error: srcErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", SOURCE_PROJECT_ID)
      .maybeSingle();
    if (srcErr || !srcProject) return json({ error: "Source project not found" }, 404, headers);

    const { data: srcAssets } = await admin
      .from("assets")
      .select("*")
      .eq("project_id", SOURCE_PROJECT_ID)
      .limit(400);

    // Try to find caller's personal workspace so the clone lands where their UI queries.
    let workspaceId: string | null = null;
    try {
      const { data: mem } = await admin
        .from("workspace_members")
        .select("workspace_id, workspaces:workspace_id(id,is_personal)")
        .eq("user_id", user.id);
      const personal = (mem || []).find((m: any) => m?.workspaces?.is_personal);
      workspaceId = personal?.workspace_id || (mem || [])[0]?.workspace_id || null;
    } catch { /* workspace tables may not exist for this user yet */ }

    // Clone project.
    const projectRow: any = {
      user_id: user.id,
      name: srcProject.name || "Brandbear",
      description: srcProject.description || null,
      cover_url: srcProject.cover_url || null,
      meta: {
        ...(srcProject.meta || {}),
        demo: true,
        demo_source: SOURCE_PROJECT_ID,
        seeded_at: new Date().toISOString(),
      },
    };
    if (workspaceId) projectRow.workspace_id = workspaceId;

    let insertRes = await admin.from("projects").insert(projectRow).select("id").single();
    if (insertRes.error && /workspace_id/i.test(insertRes.error.message || "")) {
      delete projectRow.workspace_id;
      insertRes = await admin.from("projects").insert(projectRow).select("id").single();
    }
    if (insertRes.error || !insertRes.data?.id) {
      return json({ error: insertRes.error?.message || "Failed to clone project" }, 500, headers);
    }
    const newProjectId = insertRes.data.id;

    // Clone assets.
    const assetRows = (srcAssets || []).map((a: any) => {
      const row: any = {
        user_id: user.id,
        project_id: newProjectId,
        asset_type: a.asset_type,
        title: a.title,
        content: a.content,
        image_url: a.image_url,
        thumbnail_url: a.thumbnail_url,
        prompt: a.prompt,
        source_url: a.source_url,
        editor_state: a.editor_state,
        pinned: !!a.pinned,
        meta: {
          ...(a.meta || {}),
          demo: true,
          demo_source_asset: a.id,
          // Preserve saved_at so the asset shows up inside the Brand Kit views
          // that filter by meta.saved_at.
          saved_at: a.meta?.saved_at || a.created_at || new Date().toISOString(),
        },
      };
      if (workspaceId) row.workspace_id = workspaceId;
      return row;
    });

    if (assetRows.length > 0) {
      let ins = await admin.from("assets").insert(assetRows);
      if (ins.error && /workspace_id/i.test(ins.error.message || "")) {
        const stripped = assetRows.map((r) => { const { workspace_id, ...rest } = r; return rest; });
        ins = await admin.from("assets").insert(stripped);
      }
      if (ins.error) {
        return json({ error: ins.error.message, project_id: newProjectId }, 500, headers);
      }
    }

    return json({
      status: "seeded",
      project_id: newProjectId,
      assets: assetRows.length,
    }, 200, headers);
  } catch (error) {
    return json({ error: (error as Error).message }, 500, headers);
  }
});
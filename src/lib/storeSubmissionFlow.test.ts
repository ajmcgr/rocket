// Exercise the actual Edge handler with deterministic store/network/database boundaries.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, it, expect, vi } from "vitest";
import * as ingestion from "../../supabase/functions/_shared/appIngestion";
import * as submission from "../../supabase/functions/_shared/appSubmission";
import * as imports from "../../supabase/functions/_shared/submissionImport";
import * as stores from "../../supabase/functions/_shared/storeListings";
import { APP_CATEGORIES } from "../../supabase/functions/_shared/appCategories";
const store = "https://apps.apple.com/gb/app/example/id12345";
const cdn = "https://is1-ssl.mzstatic.com/";
const storage =
  "https://test-project.supabase.co/storage/v1/object/public/rocket-images/alice/";
const details = () => ({
  ...submission.emptySubmission(),
  name: "Example",
  description: "A useful mobile application for independent teams.",
  tagline: "Useful mobile software",
  slug: "example",
  categories: ["Productivity"],
  platforms: ["ios"],
  logo_url: cdn + "icon.png",
  hero_url: storage + "cover.png",
  screenshots: [cdn + "screen.png"],
});
function harness() {
  let handler!: (r: Request) => Promise<Response>;
  const pending: Record<string, any>[] = [];
  const jobs: Record<string, any>[] = [];
  const writes = vi.fn();
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === "lookup_store_app_submission")
      return { data: [], error: null };
    if (name === "resolve_store_app_submission") {
      const job = jobs.find((j) => j.id === args.p_job_id)!;
      const appId = webcrypto.randomUUID();
      Object.assign(job, {
        status: "complete",
        app_id: appId,
        result: { outcome: "new", app_id: appId },
      });
      return { data: { outcome: "new", app_id: appId }, error: null };
    }
    if (name === "publish_new_app_submission")
      return {
        data: { published: true, slug: args.p_details.slug },
        error: null,
      };
    return { data: null, error: null };
  });
  const from = (table: string) => {
    let op = "select",
      payload: any;
    const filters: Record<string, any> = {};
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        filters[k] = v;
        return q;
      },
      is: (k: string, v: any) => {
        filters[k] = v;
        return q;
      },
      gte: () => q,
      gt: () => q,
      limit: () => q,
      insert: (v: any) => {
        op = "insert";
        payload = v;
        return q;
      },
      upsert: (v: any) => {
        op = "insert";
        payload = v;
        return q;
      },
      update: (v: any) => {
        op = "update";
        payload = v;
        return q;
      },
      maybeSingle: () => q,
      single: () => q,
      then: (resolve: any) => {
        if (op !== "select") writes(table, op, payload);
        const rows =
          table === "pending_app_previews"
            ? pending
            : table === "app_jobs"
              ? jobs
              : [];
        const matches = rows.filter((r) =>
          Object.entries(filters).every(([k, v]) =>
            v === null ? r[k] == null : r[k] === v,
          ),
        );
        let data: any = null;
        if (
          op === "insert" &&
          ["pending_app_previews", "app_jobs"].includes(table)
        ) {
          data = { id: webcrypto.randomUUID(), status: "queued", ...payload };
          rows.push(data);
        } else if (op === "update") {
          for (const row of matches) Object.assign(row, payload);
          data = matches[0] || null;
        } else data = matches[0] || null;
        return Promise.resolve({ data, error: null, count: 0 }).then(resolve);
      },
    };
    return q;
  };
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("itunes.apple.com/lookup"))
      return {
        url,
        contentType: "application/json",
        bytes: new TextEncoder().encode(
          JSON.stringify({
            results: [
              {
                trackId: 12345,
                kind: "software",
                trackName: "Example",
                description:
                  "A useful mobile application for independent teams.",
                artworkUrl512: cdn + "icon.png",
                screenshotUrls: [cdn + "screen.png"],
                primaryGenreName: "Productivity",
                sellerUrl: "https://example.com",
              },
            ],
          }),
        ),
      };
    if (url.includes("play.google.com"))
      throw new Error("Google Play unavailable");
    const b = new Uint8Array(24);
    b.set([137, 80, 78, 71]);
    new DataView(b.buffer).setUint32(16, url.includes("icon") ? 512 : 600);
    new DataView(b.buffer).setUint32(20, url.includes("icon") ? 512 : 1200);
    return { url, contentType: "image/png", bytes: b };
  });
  const source = readFileSync(
    "supabase/functions/rocket-apps/index.ts",
    "utf8",
  ).replace(/^import[\s\S]*?;\n/gm, "");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      ...ingestion,
      ...submission,
      ...imports,
      ...stores,
      APP_CATEGORIES,
      fetchPublicBytes: fetch,
      hasGeminiKey: () => false,
      createClient: () => ({
        from,
        rpc,
        auth: {
          getUser: async (token: string) => ({
            data: { user: token === "valid" ? { id: "alice" } : null },
            error: null,
          }),
        },
      }),
      Deno: {
        env: {
          get: (k: string) =>
            k === "SUPABASE_URL"
              ? "https://test-project.supabase.co"
              : "test-only",
        },
        serve: (fn: typeof handler) => (handler = fn),
      },
      Response,
      Request,
      URL,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      DataView,
      crypto: webcrypto,
      btoa,
      Date,
      console,
    },
  );
  const request = async (body: Record<string, unknown>, logged = true) => {
    const response = await handler(
      new Request("https://test-project.supabase.co", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(logged ? { authorization: "Bearer valid" } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  return { request, rpc, writes, pending, jobs, fetch };
}
describe("store submission Edge flow", () => {
  it("previews official media/platforms without creating apps or exposing a private host match", async () => {
    const h = harness();
    const r = await h.request({ action: "preview", url: store }, false);
    expect(r.status).toBe(200);
    expect(r.body.app).toMatchObject({
      platforms: ["ios"],
      screenshots: [cdn + "screen.png"],
      hero_url: null,
      logo_url: cdn + "icon.png",
      website_url: "https://apps.apple.com/gb/app/id12345",
    });
    expect(h.jobs).toHaveLength(0);
    expect(h.rpc.mock.calls.map(([n]) => n)).toEqual([
      "lookup_store_app_submission",
    ]);
    expect(h.pending[0].preview.store_media_urls).toEqual([
      cdn + "icon.png",
      cdn + "screen.png",
    ]);
  });
  it("publishes only after authentication and retains the original user/store identity and reviewed details", async () => {
    const h = harness();
    const preview = await h.request({
      action: "preview",
      url: store,
      manual: true,
      details: details(),
    });
    expect(preview.status).toBe(200);
    expect(
      (
        await h.request(
          {
            action: "consume_preview",
            token: preview.body.token,
            publish: true,
          },
          false,
        )
      ).status,
    ).toBe(401);
    const result = await h.request({
      action: "consume_preview",
      token: preview.body.token,
      publish: true,
      user_id: "mallory",
    });
    expect(result.body.published).toBe(true);
    expect(h.rpc).toHaveBeenCalledWith(
      "resolve_store_app_submission",
      expect.objectContaining({
        p_user_id: "alice",
        p_source_type: "apple_app_store",
        p_external_id: "12345",
        p_source_url: "https://apps.apple.com/app/id12345",
      }),
    );
    expect(h.rpc).toHaveBeenCalledWith(
      "publish_new_app_submission",
      expect.objectContaining({
        p_user_id: "alice",
        p_details: expect.objectContaining({
          name: "Example",
          platforms: ["ios"],
        }),
      }),
    );
    expect(
      (
        await h.request({
          action: "consume_preview",
          token: preview.body.token,
          publish: true,
        })
      ).status,
    ).toBe(400);
    expect(h.rpc.mock.calls.some(([n]) => /verification|owner/.test(n))).toBe(
      false,
    );
  });
  it("ignores client-injected media permissions and blocks unrelated CDN images at publication", async () => {
    const h = harness();
    const fields = {
      ...details(),
      screenshots: ["https://is1-ssl.mzstatic.com/another-app.png"],
    };
    const p = await h.request({
      action: "preview",
      url: store,
      manual: true,
      details: fields,
      store_media_urls: fields.screenshots,
    });
    expect(p.status).toBe(200);
    const result = await h.request({
      action: "consume_preview",
      token: p.body.token,
      publish: true,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/Upload your images/);
    expect(
      h.rpc.mock.calls.some(([n]) => n === "publish_new_app_submission"),
    ).toBe(false);
  });
  it("preserves manual store entry during a provider outage without authorizing any CDN artwork", async () => {
    const h = harness();
    const p = await h.request({
      action: "preview",
      manual: true,
      url: "https://play.google.com/store/apps/details?id=com.example.app",
      details: {
        ...details(),
        logo_url: storage + "icon.png",
        screenshots: [storage + "shot.png"],
      },
    });
    expect(p.status).toBe(200);
    expect(h.pending[0].preview.store_media_urls).toEqual([]);
    expect(h.pending[0].preview.store_app.observed).toBe(false);
    expect(
      (
        await h.request({
          action: "consume_preview",
          token: p.body.token,
          publish: true,
        })
      ).body.published,
    ).toBe(true);
  });
});

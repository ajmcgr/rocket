import { expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Route as legacy } from "../routes/u.$username";
import { Route as canonical } from "../routes/@{$username}";

vi.mock("@/pages/PublicMemberProfile", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

type BeforeLoad = (context: {
  params: { username: string }; location: { searchStr: string; hash: string };
}) => unknown;
const context = (username: string) => ({ params: { username }, location: { searchStr: "?utm_source=share", hash: "apps" } });

it.each(["alex", "new_builder", "builder123"])("matches /@%s with the installed router", async username => {
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: "/@{$username}" });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/@${username}`] }) });
  await router.load();
  expect(router.state.matches.at(-1)?.params).toMatchObject({ username });
});

it.each(["alex", "new_builder", "Alex"])("permanently redirects legacy %s and preserves query/hash", username => {
  const beforeLoad = legacy.options.beforeLoad as unknown as BeforeLoad;
  try { beforeLoad(context(username)); throw new Error("Expected redirect"); }
  catch (error) {
    expect((error as { options: unknown }).options).toMatchObject({ href: `/@${username.toLowerCase()}?utm_source=share#apps`, statusCode: 301, replace: true });
  }
});

it("normalizes uppercase handles without redirect loops or unsafe destinations", () => {
  const beforeLoad = canonical.options.beforeLoad as unknown as BeforeLoad;
  expect(() => beforeLoad(context("Alex"))).toThrow();
  expect(beforeLoad(context("alex"))).toBeUndefined();
  expect((legacy.options.beforeLoad as unknown as BeforeLoad)(context("https://evil.invalid"))).toBeUndefined();
});

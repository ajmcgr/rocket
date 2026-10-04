import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc } }));

describe("workspace entitlement routing", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("uses the authenticated atomic RPC, not a direct-table fallback", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Rocket Developer required" } });
    const { createWorkspace } = await import("./workspace");
    await expect(createWorkspace("Team")).rejects.toThrow("Rocket Developer required");
    expect(mocks.rpc).toHaveBeenCalledWith("create_workspace", { _name: "Team" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps personal workspace creation separate and free", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "personal", name: "Personal", is_personal: true }, error: null });
    const { createWorkspace } = await import("./workspace");
    expect((await createWorkspace(" Personal ", { isPersonal: true })).is_personal).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_personal_workspace", { _name: "Personal" });
  });

  it("isolates cached workspace lists when accounts change", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "first" } } }).mockResolvedValueOnce({ data: { user: { id: "second" } } });
    const eq = vi.fn();
    mocks.from.mockImplementation(() => ({ select: () => ({ eq: (key: string, id: string) => {
      eq(key, id);
      return { order: async () => ({ data: [{ role: "owner", workspaces: { id, name: id, is_personal: true } }], error: null }) };
    } }) }));
    const { listWorkspaces } = await import("./workspace");
    expect((await listWorkspaces())[0].id).toBe("first");
    expect((await listWorkspaces())[0].id).toBe("second");
    expect(eq).toHaveBeenNthCalledWith(2, "user_id", "second");
  });

  it("fails closed when a team's entitlement check fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ role: "owner", workspaces: { id: "team", name: "Team", is_personal: false } }], error: null }) }) }) });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    const { listWorkspaces } = await import("./workspace");
    expect((await listWorkspaces())[0].team_access).toBe(false);
  });
});

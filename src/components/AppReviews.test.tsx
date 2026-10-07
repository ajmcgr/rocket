import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppReviews from "./AppReviews";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  reviews: [] as Array<Record<string, unknown>>,
  summary: null as null | { rating_count: number; average_rating: number },
  rpc: vi.fn(),
  responses: [] as Array<Record<string,unknown>>,
  ownership: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {limit: async () => ({data: table==='app_review_responses' ? mocks.responses : mocks.reviews,error:null}),
        maybeSingle: async () => ({data:table==='public_app_review_summary' ? mocks.summary : table==='app_owners' && mocks.ownership ? {verification_level:'domain_verified'} : null,error:null})};
      for (const key of ['select','eq','in','is','order']) q[key]=()=>q;
      return q;
    },
    rpc: mocks.rpc,
  },
}));

describe("real app reviews", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
    mocks.user = null;
    mocks.reviews = [];
    mocks.summary = null;
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({data:[],error:null});
    mocks.responses=[];mocks.ownership=false;
  });

  it("retains a refunded negative review, labels the actual purchase and allows a separate owner response",async()=>{
    mocks.user={id:'developer'};mocks.ownership=true;
    mocks.reviews=[{id:'review-1',app_id:'app-1',user_id:'buyer',rating:1,body:'This did not work for me.',created_at:'2026-10-07',updated_at:'2026-10-07'}];
    mocks.responses=[{review_id:'review-1',body:'We are sorry; please contact support.'}];
    mocks.rpc.mockImplementation(async(name:string)=>({data:name==='get_app_review_purchase_labels' ? [{review_id:'review-1',purchase_label:'Verified purchase · refunded'}] : null,error:null}));
    const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
    try {
      await act(async()=>root.render(<MemoryRouter><AppReviews appId="app-1" /></MemoryRouter>));
      expect(container.textContent).toContain('This did not work for me.');
      expect(container.textContent).toContain('Verified purchase · refunded');
      expect(container.textContent).toContain('Not verified usage');
      expect(container.textContent).toContain('Developer response');
      await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Save response')!.click());
      expect(mocks.rpc).toHaveBeenCalledWith('respond_app_review',{p_review_id:'review-1',p_body:'We are sorry; please contact support.'});
      expect(container.textContent).toContain('This did not work for me.');
    } finally {await act(async()=>root.unmount());container.remove();}
  });

  it("shows no fabricated rating and asks an anonymous visitor to sign in", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <AppReviews appId="app-1" />
          </MemoryRouter>,
        );
      });
      expect(container.textContent).toContain("No reviews yet");
      expect(container.textContent).not.toContain("0 stars");
      expect(
        container.querySelector('a[href="/login?next=%2Fapps%2Fapp-1"]'),
      ).not.toBeNull();
      expect(container.querySelector("textarea")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shows only actual published review data and lets the author edit", async () => {
    mocks.user = { id: "owner-1" };
    mocks.reviews = [
      {
        id: "review-1",
        app_id: "app-1",
        user_id: "owner-1",
        rating: 4,
        body: "A genuinely useful product.",
        created_at: "2026-09-30T00:00:00Z",
        updated_at: "2026-09-30T00:00:00Z",
      },
    ];
    mocks.summary = { rating_count: 1, average_rating: 4 };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <AppReviews appId="app-1" />
          </MemoryRouter>,
        );
      });
      expect(container.textContent).toContain("from 1 review");
      expect(container.textContent).toContain("A genuinely useful product.");
      expect(container.textContent).toContain("Edit your review");
      expect(container.querySelector("select")).toBeNull();
      expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(5);
      expect(container.querySelector<HTMLInputElement>('input[value="4"]')?.checked).toBe(true);
      expect(container.querySelectorAll("form .fill-amber-400")).toHaveLength(4);
      await act(async () => { container.querySelector<HTMLInputElement>('input[value="2"]')!.click(); });
      expect(container.querySelector<HTMLInputElement>('input[value="2"]')?.checked).toBe(true);
      expect(container.querySelectorAll("form .fill-amber-400")).toHaveLength(2);
      expect(container.textContent).toContain("2 out of 5");
      expect(
        (container.querySelector("textarea") as HTMLTextAreaElement).value,
      ).toBe("A genuinely useful product.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

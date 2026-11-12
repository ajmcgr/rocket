import { supabase } from "@/integrations/supabase/client";

export const acquisitionDb = supabase as any;

export type AcquisitionListing = {
  app_id: string;
  seller_user_id: string;
  status: "not_for_sale" | "open_to_offers" | "for_sale";
  review_status: "pending" | "approved" | "rejected";
  asking_price_cents: number | null;
  description: string;
  reason_for_selling: string;
  preferred_buyer: string;
  updated_at: string;
};

export type PublicAcquisitionListing = Pick<AcquisitionListing,
  "app_id" | "status" | "review_status" | "asking_price_cents" | "description" | "updated_at">;

export const publicListing = (listing: PublicAcquisitionListing | null | undefined) =>
  !!listing && listing.review_status === "approved" && listing.status !== "not_for_sale";

export const askingPrice = (cents: number | null) => cents == null
  ? "Price on request"
  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

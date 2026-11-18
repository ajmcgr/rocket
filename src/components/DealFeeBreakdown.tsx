import { useEffect, useState } from "react";
import { dealsDb, money, type DealCurrency, type DealFinancial, type FeeQuote } from "@/lib/rocketDeals";

type Props = { priceMinor: number | null; currency: DealCurrency; role: "buyer" | "seller";
  locked?: DealFinancial | null; onQuote?: (quote: FeeQuote | null) => void };

export default function DealFeeBreakdown({ priceMinor, currency, role, locked, onQuote }: Props) {
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (locked) { setQuote(locked); setError(""); onQuote?.(locked); return; }
    if (priceMinor === null) { setQuote(null); setError(""); onQuote?.(null); return; }
    onQuote?.(null);
    let active = true;
    const timer = setTimeout(() => {
      void dealsDb.rpc("rocket_deal_fee_quote", { p_price_minor: priceMinor, p_currency: currency })
        .then(({ data, error: issue }: { data: FeeQuote | null; error: { message: string } | null }) => {
          if (!active) return;
          setQuote(issue ? null : data);
          setError(issue?.message || "");
          onQuote?.(issue ? null : data);
        });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [priceMinor, currency, locked, onQuote]);
  if (priceMinor === null && !locked) return null;
  return <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm" aria-live="polite">
    <h3 className="font-semibold">{locked ? "Agreed transaction summary" : "Estimated transaction summary"}</h3>
    {error && <p className="mt-2 text-red-700">Fee quote unavailable: {error}</p>}
    {quote && <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2">
      <dt>Acquisition price</dt><dd className="text-right">{money(quote.acquisition_price_minor, quote.currency)}</dd>
      <dt>Rocket closing fee {quote.usd_minimum_applied ? "(minimum share)" : "(1.5%, rounded)"}</dt><dd className="text-right">{money(role === "buyer" ? quote.buyer_fee_minor : quote.seller_fee_minor, quote.currency)}</dd>
      <dt className="border-t pt-2 font-semibold">{role === "buyer" ? "Buyer total payable" : "Seller net proceeds"}</dt>
      <dd className="border-t pt-2 text-right font-semibold">{money(role === "buyer" ? quote.buyer_total_minor : quote.seller_net_minor, quote.currency)}</dd>
    </dl>}
    {quote?.usd_minimum_applied && <p className="mt-2 text-xs text-neutral-600">The $99 combined minimum applies here; each party pays $49.50.</p>}
    <p className="mt-3 text-xs text-neutral-700">Rocket charges a 3% closing fee, split equally between buyer and seller, with a $99 combined minimum for USD deals. Fees are only payable when a transaction successfully closes.</p>
    <p className="mt-1 text-xs text-neutral-600">Third-party escrow and processing fees are separate and are not included in Rocket’s fee.</p>
    {locked && <p className="mt-1 text-xs text-neutral-600">Price and fee version {locked.fee_version} were locked when the offer was accepted. No funds have been collected by Rocket.</p>}
    {locked?.provider_fee_minor != null && <p className="mt-2 text-xs">External escrow provider fee: {money(locked.provider_fee_minor, locked.currency)}</p>}
    {locked?.processing_fee_minor != null && <p className="text-xs">External processing fee: {money(locked.processing_fee_minor, locked.currency)}</p>}
  </div>;
}

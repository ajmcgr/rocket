// Escrow.com v2017-09-01 adapter. Server-only; callers choose the environment.
export type EscrowEnvironment = "sandbox" | "production";
export type EscrowTransaction = {
  id: number;
  reference?: string;
  currency: string;
  close_date?: string | null;
  is_cancelled?: boolean;
  parties: Array<{ role: string; customer: string; agreed?: boolean }>;
  items: Array<{
    type: string;
    inspection_period?: number;
    quantity?: number;
    status?: {
      shipped?: boolean;
      received?: boolean;
      accepted?: boolean;
      rejected?: boolean;
    };
    schedule: Array<{
      amount: string | number;
      payer_customer: string;
      beneficiary_customer: string;
      status?: {
        secured?: boolean;
        payment_sent?: boolean;
        payment_received?: boolean;
        disbursed_to_beneficiary?: boolean;
        disbursed_to_payer?: boolean;
      };
    }>;
    fees?: Array<{ type: string; amount: string | number }>;
  }>;
};
export type EscrowTerms = {
  reference: string;
  appName: string;
  buyerEmail: string;
  sellerEmail: string;
  brokerEmail: string;
  priceMinor: number;
  buyerFeeMinor: number;
  sellerFeeMinor: number;
  inspectionDays: number;
};
export type EscrowSnapshot = {
  reference: string;
  environment: EscrowEnvironment;
  status:
    | "awaiting_acceptance"
    | "awaiting_payment"
    | "funds_secured"
    | "handover"
    | "inspection"
    | "completed"
    | "cancelled"
    | "refunded"
    | "disputed";
  buyer_agreed: boolean;
  seller_agreed: boolean;
  funds_secured: boolean;
  handover_started: boolean;
  inspection_started: boolean;
  completed: boolean;
  cancelled: boolean;
  refunded: boolean;
  rocket_fee_disbursed_minor: number;
  escrow_fee_minor: number | null;
};

const bases = {
  sandbox: "https://api.escrow-sandbox.com/2017-09-01",
  production: "https://api.escrow.com/2017-09-01",
} as const;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const inspectionDays = (value: string): number | null => {
  const match = /^\s*(\d{1,2})\s+days?\s*$/i.exec(value);
  const days = Number(match?.[1]);
  return days >= 1 && days <= 30 ? days : null;
};
const dollars = (minor: number): number => {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > 100000000000)
    throw new Error("Invalid amount");
  return minor / 100;
};
const minorAmount = (value: string | number): number => {
  const raw = String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw))
    throw new Error("Invalid provider amount");
  const [whole, fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Invalid provider amount");
  return result;
};
export function createPayload(terms: EscrowTerms) {
  if (
    !/^[a-zA-Z0-9]{8,24}$/.test(terms.reference) ||
    !emailPattern.test(terms.buyerEmail) ||
    !emailPattern.test(terms.sellerEmail) ||
    !emailPattern.test(terms.brokerEmail) ||
    new Set(
      [terms.buyerEmail, terms.sellerEmail, terms.brokerEmail].map((s) =>
        s.toLowerCase(),
      ),
    ).size !== 3 ||
    !Number.isInteger(terms.inspectionDays) ||
    terms.inspectionDays < 1 ||
    terms.inspectionDays > 30 ||
    terms.priceMinor < 100 ||
    terms.buyerFeeMinor <= 0 ||
    terms.sellerFeeMinor <= 0
  ) {
    throw new Error("Escrow terms are not supported");
  }
  const description = `Acquisition of ${terms.appName}`.slice(0, 256);
  return {
    reference: terms.reference,
    currency: "usd",
    description,
    parties: [
      { role: "broker", customer: "me" },
      { role: "buyer", customer: terms.buyerEmail },
      { role: "seller", customer: terms.sellerEmail },
    ],
    items: [
      {
        type: "general_merchandise",
        title: terms.appName.slice(0, 150),
        description,
        shipping_type: "no_shipping",
        category: "computer_hardware_and_software",
        inspection_period: terms.inspectionDays * 86400,
        quantity: 1,
        schedule: [
          {
            amount: dollars(terms.priceMinor),
            payer_customer: terms.buyerEmail,
            beneficiary_customer: terms.sellerEmail,
          },
        ],
      },
      {
        type: "broker_fee",
        schedule: [
          {
            amount: dollars(terms.buyerFeeMinor),
            payer_customer: terms.buyerEmail,
            beneficiary_customer: "me",
          },
        ],
      },
      {
        type: "broker_fee",
        schedule: [
          {
            amount: dollars(terms.sellerFeeMinor),
            payer_customer: terms.sellerEmail,
            beneficiary_customer: "me",
          },
        ],
      },
    ],
  };
}

export function verifyAndMap(
  transaction: EscrowTransaction,
  terms: EscrowTerms,
  environment: EscrowEnvironment,
): EscrowSnapshot {
  if (
    !Number.isSafeInteger(transaction.id) ||
    transaction.id <= 0 ||
    transaction.reference !== terms.reference ||
    transaction.currency.toLowerCase() !== "usd"
  ) {
    throw new Error("Escrow transaction identity mismatch");
  }
  const buyer = transaction.parties.find((party) => party.role === "buyer");
  const seller = transaction.parties.find((party) => party.role === "seller");
  const broker = transaction.parties.find((party) => party.role === "broker");
  if (
    buyer?.customer.toLowerCase() !== terms.buyerEmail.toLowerCase() ||
    seller?.customer.toLowerCase() !== terms.sellerEmail.toLowerCase() ||
    broker?.customer.toLowerCase() !== terms.brokerEmail.toLowerCase()
  ) {
    throw new Error("Escrow transaction parties mismatch");
  }
  const main = transaction.items.find(
    (item) => item.type === "general_merchandise",
  );
  const feeItems = transaction.items.filter(
    (item) => item.type === "broker_fee",
  );
  const mainSchedule = main?.schedule?.[0];
  if (
    !main ||
    transaction.items.filter((item) => item.type === "general_merchandise")
      .length !== 1 ||
    main.schedule.length !== 1 ||
    main.inspection_period !== terms.inspectionDays * 86400 ||
    !mainSchedule ||
    minorAmount(mainSchedule.amount) !== terms.priceMinor ||
    mainSchedule.payer_customer.toLowerCase() !==
      terms.buyerEmail.toLowerCase() ||
    mainSchedule.beneficiary_customer.toLowerCase() !==
      terms.sellerEmail.toLowerCase() ||
    feeItems.length !== 2 ||
    feeItems.some((item) => item.schedule.length !== 1)
  ) {
    throw new Error("Escrow transaction terms mismatch");
  }
  const buyerFee = feeItems.find(
    (item) =>
      item.schedule[0].payer_customer.toLowerCase() ===
      terms.buyerEmail.toLowerCase(),
  );
  const sellerFee = feeItems.find(
    (item) =>
      item.schedule[0].payer_customer.toLowerCase() ===
      terms.sellerEmail.toLowerCase(),
  );
  if (
    !buyerFee ||
    !sellerFee ||
    minorAmount(buyerFee.schedule[0].amount) !== terms.buyerFeeMinor ||
    minorAmount(sellerFee.schedule[0].amount) !== terms.sellerFeeMinor ||
    feeItems.some(
      (item) =>
        item.schedule[0].beneficiary_customer.toLowerCase() !==
        terms.brokerEmail.toLowerCase(),
    )
  ) {
    throw new Error("Rocket broker fees mismatch");
  }
  const funds = mainSchedule.status?.secured === true;
  const completed =
    !!transaction.close_date &&
    mainSchedule.status?.disbursed_to_beneficiary === true;
  const refunded = mainSchedule.status?.disbursed_to_payer === true;
  const cancelled = transaction.is_cancelled === true;
  const disputed = main.status?.rejected === true;
  const inspection = main.status?.received === true;
  const handover = main.status?.shipped === true;
  const rocketFeeDisbursed = feeItems.reduce(
    (sum, item) =>
      sum +
      (item.schedule[0].status?.disbursed_to_beneficiary
        ? minorAmount(item.schedule[0].amount)
        : 0),
    0,
  );
  const providerFee =
    main.fees
      ?.filter((fee) => fee.type === "escrow")
      .reduce((sum, fee) => sum + minorAmount(fee.amount), 0) ?? null;
  const status = refunded
    ? "refunded"
    : cancelled
      ? "cancelled"
      : disputed
        ? "disputed"
        : completed
          ? "completed"
          : funds && inspection
            ? "inspection"
            : funds && handover
              ? "handover"
              : funds
                ? "funds_secured"
                : buyer.agreed && seller.agreed
                  ? "awaiting_payment"
                  : "awaiting_acceptance";
  return {
    reference: terms.reference,
    environment,
    status,
    buyer_agreed: buyer.agreed === true,
    seller_agreed: seller.agreed === true,
    funds_secured: funds,
    handover_started: handover,
    inspection_started: inspection,
    completed,
    cancelled,
    refunded,
    rocket_fee_disbursed_minor: rocketFeeDisbursed,
    escrow_fee_minor: providerFee,
  };
}

export class EscrowApiError extends Error {
  constructor(public readonly status: number) {
    super(`Escrow.com request failed (${status})`);
  }
}
export class EscrowComClient {
  constructor(
    private readonly environment: EscrowEnvironment,
    private readonly email: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!emailPattern.test(email) || !apiKey)
      throw new Error("Escrow.com is not configured");
  }
  async verifyAccount(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(`${bases[this.environment]}/customer/me`, {
        method: "GET",
        headers: { Authorization: `Basic ${btoa(`${this.email}:${this.apiKey}`)}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new EscrowApiError(response.status);
      const body = await response.text();
      if (body.length > 65536) throw new Error("Invalid Escrow.com account response");
      let account: unknown;
      try { account = JSON.parse(body); } catch { throw new Error("Invalid Escrow.com account response"); }
      if (!account || typeof account !== "object" ||
        !Number.isSafeInteger((account as {id?: number}).id))
        throw new Error("Invalid Escrow.com account response");
    } finally {
      clearTimeout(timeout);
    }
  }
  private async request(
    path: string,
    method: "GET" | "POST",
    payload?: unknown,
  ): Promise<EscrowTransaction> {
    const attempts = method === "GET" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await this.fetcher(`${bases[this.environment]}${path}`, {
          method,
          headers: {
            Authorization: `Basic ${btoa(`${this.email}:${this.apiKey}`)}`,
            "Content-Type": "application/json",
          },
          body: payload === undefined ? undefined : JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (
        method === "GET" &&
        attempt === 0 &&
        [429, 502, 503, 504].includes(response.status)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      if (!response.ok) throw new EscrowApiError(response.status);
      const body = await response.text();
      if (body.length > 262144)
        throw new Error("Escrow.com response exceeded limit");
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error("Invalid Escrow.com response");
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Number.isSafeInteger((parsed as EscrowTransaction).id) ||
        !Array.isArray((parsed as EscrowTransaction).items) ||
        !Array.isArray((parsed as EscrowTransaction).parties)
      ) {
        throw new Error("Invalid Escrow.com transaction");
      }
      return parsed as EscrowTransaction;
    }
    throw new Error("Escrow.com request failed");
  }
  create(terms: EscrowTerms) {
    return this.request("/transaction", "POST", createPayload(terms));
  }
  byReference(reference: string) {
    if (!/^[a-zA-Z0-9]{8,24}$/.test(reference))
      throw new Error("Invalid reference");
    return this.request(`/transaction/reference/${reference}`, "GET");
  }
  byId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("Invalid transaction ID");
    return this.request(`/transaction/${id}`, "GET");
  }
}

export const ORGANISER_PLANS_STORAGE_KEY = "eventis.organiser-plans.v1";
export type PlanInterval = "post" | "month" | "quarter" | "year";
export type OrganiserPaymentMethod = "mtn_momo" | "airtel_money";
export interface PlanPrice {
  quantity: number;
  total: number;
}
export interface OrganiserPlan {
  id: string;
  name: string;
  interval: PlanInterval;
  description: string;
  features: string[];
  badge: string;
  recommended: boolean;
  active: boolean;
  prices: PlanPrice[];
}
export interface OrganiserCatalog {
  version: 1;
  currency: "RWF";
  payment_methods: OrganiserPaymentMethod[];
  plans: OrganiserPlan[];
}
// Starting prices and stable IDs match Eventis-mobile-app/services/organiserService.ts.
// This is a frontend fixture; saving it does not modify the separate mobile repo.
export function defaultOrganiserCatalog(): OrganiserCatalog {
  return {
    version: 1,
    currency: "RWF",
    payment_methods: ["mtn_momo", "airtel_money"],
    plans: [
      {
        id: "organiser_post",
        name: "Pay per post",
        interval: "post",
        active: true,
        description:
          "Post one or two events. No subscription or organisation setup required.",
        prices: [
          { quantity: 1, total: 2180 },
          { quantity: 2, total: 4180 },
        ],
        features: [
          "Pay only for the events you post",
          "Instant event activation",
          "Real-time attendee RSVP & tickets",
          "Live check-in & door QR scan",
        ],
        badge: "No commitment",
        recommended: false,
      },
      {
        id: "organiser_monthly",
        name: "Monthly",
        interval: "month",
        active: true,
        description:
          "Unlimited posting all month. Ideal for venues, clubs and promoters.",
        prices: [{ quantity: 1, total: 18000 }],
        features: [
          "Unlimited event listings",
          "Official Verified Organiser badge",
          "Featured placement in Discover",
          "Comprehensive revenue & analytics",
        ],
        badge: "",
        recommended: false,
      },
      {
        id: "organiser_quarterly",
        name: "Quarterly",
        interval: "quarter",
        active: true,
        description:
          "Three months of unlimited posting at a lower monthly cost.",
        prices: [{ quantity: 1, total: 48000 }],
        features: [
          "Unlimited event listings",
          "Official Verified Organiser badge",
          "Top priority discovery & push alerts",
          "Export guest lists & CSV reports",
        ],
        badge: "Popular",
        recommended: true,
      },
      {
        id: "organiser_yearly",
        name: "Yearly",
        interval: "year",
        active: true,
        description: "A full year of unlimited posting at the best price.",
        prices: [{ quantity: 1, total: 170000 }],
        features: [
          "Unlimited event listings",
          "Official Verified Organiser badge",
          "Top priority discovery & push alerts",
          "Export guest lists & CSV reports",
          "Dedicated organiser support",
        ],
        badge: "Best Value",
        recommended: false,
      },
    ],
  };
}
export function formatPlanMoney(amount: number): string {
  return new Intl.NumberFormat("en-RW", {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(amount);
}
export function planQuantity(
  plan: Pick<OrganiserPlan, "interval">,
  quantity: number,
): string {
  return `${quantity} ${plan.interval}${quantity === 1 ? "" : "s"}`;
}
export function planEntitlement(
  plan: Pick<OrganiserPlan, "interval">,
  quantity: number,
): string {
  if (plan.interval === "post")
    return `${quantity} event ${quantity === 1 ? "post" : "posts"} · unused posts never expire`;
  const months =
    quantity *
    (plan.interval === "year" ? 12 : plan.interval === "quarter" ? 3 : 1);
  return `Unlimited event posting for ${months} ${months === 1 ? "month" : "months"}`;
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateOrganiserPlan(plan: OrganiserPlan): void {
  check(
    plan &&
      typeof plan.id === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(plan.id),
    "Each plan needs a valid unique ID.",
  );
  check(
    typeof plan.name === "string" &&
      plan.name.trim().length > 0 &&
      plan.name.length <= 120,
    "Enter a plan name (maximum 120 characters).",
  );
  check(
    ["post", "month", "quarter", "year"].includes(plan.interval),
    "Select a valid billing period.",
  );
  check(
    typeof plan.description === "string" && plan.description.length <= 1000,
    "Descriptions can contain up to 1,000 characters.",
  );
  check(
    typeof plan.badge === "string" && plan.badge.length <= 80,
    "Badges can contain up to 80 characters.",
  );
  check(
    Array.isArray(plan.features) &&
      plan.features.length <= 20 &&
      plan.features.every(
        (f) => typeof f === "string" && f.trim().length > 0 && f.length <= 200,
      ),
    "Use up to 20 benefits, each between 1 and 200 characters.",
  );
  check(
    typeof plan.active === "boolean" && typeof plan.recommended === "boolean",
    "Availability and recommendation settings must be true or false.",
  );
  check(
    Array.isArray(plan.prices) &&
      plan.prices.length > 0 &&
      plan.prices.length <= 20,
    `${plan.name}: add between 1 and 20 price options.`,
  );
  check(
    new Set(plan.prices.map((p) => p.quantity)).size === plan.prices.length,
    `${plan.name}: quantities or durations cannot be repeated.`,
  );
  for (const option of plan.prices) {
    check(
      Number.isSafeInteger(option.quantity) &&
        option.quantity >= 1 &&
        option.quantity <= 100,
      `${plan.name}: quantities or durations must be whole numbers from 1 to 100.`,
    );
    check(
      Number.isSafeInteger(option.total) &&
        option.total > 0 &&
        option.total <= 1e9,
      `${plan.name}: prices must be whole RWF amounts from 1 to 1,000,000,000.`,
    );
  }
}
export function validateOrganiserCatalog(catalog: OrganiserCatalog): void {
  check(
    catalog?.version === 1 && catalog.currency === "RWF",
    "Unsupported organiser plan settings.",
  );
  check(
    Array.isArray(catalog.payment_methods) &&
      catalog.payment_methods.length > 0 &&
      new Set(catalog.payment_methods).size ===
        catalog.payment_methods.length &&
      catalog.payment_methods.every(
        (m) => m === "mtn_momo" || m === "airtel_money",
      ),
    "Select at least one supported payment method.",
  );
  check(
    Array.isArray(catalog.plans) &&
      catalog.plans.length > 0 &&
      catalog.plans.length <= 50,
    "Keep between 1 and 50 organiser plans.",
  );
  check(
    new Set(catalog.plans.map((p) => p.id)).size === catalog.plans.length,
    "Plan IDs must be unique.",
  );
  catalog.plans.forEach(validateOrganiserPlan);
}
export function organiserPurchase(
  catalog: OrganiserCatalog,
  id: string,
  quantity: number,
) {
  const plan = catalog.plans.find((p) => p.id === id);
  check(plan?.active, "This plan is unavailable to organisers.");
  validateOrganiserPlan(plan);
  const price = plan.prices.find((p) => p.quantity === quantity);
  check(price, "Select an available post quantity or subscription duration.");
  return {
    plan,
    total: price.total,
    quantity,
    entitlement: planEntitlement(plan, quantity),
  };
}

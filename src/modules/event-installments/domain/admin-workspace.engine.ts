import {
  organiserPurchase,
  validateOrganiserCatalog,
  type OrganiserCatalog,
} from "../../../common/contracts/organiser-catalog.js";

import {
  type Agreement,
  type Command,
  type Customer,
  type InstallmentStore,
  type Schedule,
  type Terms,
} from "./admin-workspace.types.js";

export const INSTALLMENTS_STORAGE_KEY = "eventis.installments.v1";
export function initialInstallmentStore(): InstallmentStore {
  return {
    version: 1,
    plans: [],
    agreements: [],
    schedules: [],
    payments: [],
    refunds: [],
    notices: [],
    audit: [],
  };
}
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function text(value: unknown, label: string): string {
  check(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 1000,
    `${label} is required (maximum 1,000 characters).`,
  );
  return value.trim();
}
function number(value: number, label: string, min = 0, max = 1e12): number {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
    `${label} must be between ${min} and ${max}.`,
  );
  return value;
}
function integer(
  value: number,
  label: string,
  min: number,
  max: number,
): number {
  number(value, label, min, max);
  check(Number.isInteger(value), `${label} must be a whole number.`);
  return value;
}
export function businessDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kigali",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function validDate(value: string): string {
  check(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a valid date.",
  );
  const date = new Date(`${value}T00:00:00Z`);
  check(
    !isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "2000-01-01" &&
      value <= "2100-12-31",
    "Enter a valid date between 2000 and 2100.",
  );
  return value;
}
export function scale(currency: string): number {
  check(
    typeof currency === "string" &&
      /^[A-Z]{3}$/.test(currency) &&
      Intl.supportedValuesOf("currency").includes(currency),
    "Choose a supported ISO currency.",
  );
  return (
    10 **
    (new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2)
  );
}
function safeNumber(value: bigint): number {
  check(
    value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER),
    "Amount exceeds the supported range.",
  );
  return Number(value); // money-guard: verified exact integer serialization boundary
}
function decimalRatio(value: number): [bigint, bigint] {
  check(
    Number.isFinite(value) && value >= 0,
    "Amounts must be finite and nonnegative.",
  );
  const text = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  const [whole, fraction = ""] = text.split(".");
  return [BigInt(whole! + fraction), 10n ** BigInt(fraction.length)];
}
export function units(amount: number, currency: string): number {
  const [numerator, denominator] = decimalRatio(amount);
  const scaled = numerator * BigInt(scale(currency));
  const rounded = (scaled * 2n + denominator) / (denominator * 2n);
  const difference = scaled - rounded * denominator;
  const distance = difference < 0n ? -difference : difference;
  // Accept only sub-millionth-minor-unit representation noise from JSON numbers,
  // matching the admin boundary without accepting fractional currency units.
  check(
    distance * 1_000_000n <= denominator,
    "Amount has too many decimal places for this currency.",
  );
  return safeNumber(rounded);
}
function percentage(amount: number, percent: number): number {
  const [numerator, denominator] = decimalRatio(percent);
  const divisor = denominator * 100n;
  return safeNumber(
    (BigInt(amount) * numerator * 2n + divisor) / (divisor * 2n),
  );
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    amount,
  );
}
export function validateTerms(t: Terms): Terms {
  check(
    t && ["weekly", "monthly", "yearly"].includes(t.frequency),
    "Select a valid payment frequency.",
  );
  integer(t.interval, "Interval", 1, 52);
  integer(t.installment_count, "Installment count", 1, 120);
  number(t.initial_payment, "Initial payment", 0, 1e9);
  number(t.interest, "Interest (%)", 0, 100);
  number(t.late_fee, "Late fee", 0, 1e9);
  integer(t.grace_period_days, "Grace period", 0, 365);
  check(
    typeof t.partial_payment === "boolean" &&
      typeof t.early_payment === "boolean",
    "Payment options must be true or false.",
  );
  return {
    frequency: t.frequency,
    interval: t.interval,
    installment_count: t.installment_count,
    initial_payment: t.initial_payment,
    interest: t.interest,
    late_fee: t.late_fee,
    grace_period_days: t.grace_period_days,
    partial_payment: t.partial_payment,
    early_payment: t.early_payment,
  };
}
export function dueDate(
  start: string,
  frequency: Terms["frequency"],
  offset: number,
): string {
  validDate(start);
  const date = new Date(`${start}T00:00:00Z`);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7 * offset);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(
      date.getUTCMonth() + offset * (frequency === "yearly" ? 12 : 1),
    );
    date.setUTCDate(
      Math.min(
        day,
        new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      ),
    );
  }
  return validDate(date.toISOString().slice(0, 10));
}
export function preview(
  terms: Terms,
  total: number,
  currency: string,
  start: string,
): Omit<Schedule, "id" | "agreement_id">[] {
  validateTerms(terms);
  validDate(start);
  const s = scale(currency);
  const principal = units(total, currency);
  check(principal > 0, "Total amount must be greater than zero.");
  const initial = units(terms.initial_payment, currency);
  units(terms.late_fee, currency);
  check(
    initial < principal,
    "Initial payment must be less than the purchase total.",
  );
  const balance = principal - initial;
  const financed = balance + percentage(balance, terms.interest);
  check(
    financed >= terms.installment_count,
    "The amount is too small for this many installments.",
  );
  const base = Math.floor(financed / terms.installment_count);
  const remainder = financed % terms.installment_count;
  const rows: Omit<Schedule, "id" | "agreement_id">[] = [];
  if (initial)
    rows.push({
      number: 0,
      due_date: start,
      amount: initial / s,
      fee: 0,
      initial: true,
      voided: false,
    });
  for (let i = 0; i < terms.installment_count; i++)
    rows.push({
      number: i + 1,
      due_date: dueDate(
        start,
        terms.frequency,
        (i + (initial ? 1 : 0)) * terms.interval,
      ),
      amount: (base + (i < remainder ? 1 : 0)) / s,
      fee: 0,
      initial: false,
      voided: false,
    });
  return rows;
}
export function paid(store: InstallmentStore, schedule: Schedule): number {
  const currency = store.agreements.find(
    (a) => a.id === schedule.agreement_id,
  )!.currency;
  return (
    store.payments
      .filter((p) => p.schedule_id === schedule.id)
      .reduce(
        (n, p) => n + units(p.amount, currency) - units(p.refunded, currency),
        0,
      ) / scale(currency)
  );
}
export function balance(store: InstallmentStore, schedule: Schedule): number {
  if (schedule.voided) return 0;
  const currency = store.agreements.find(
    (a) => a.id === schedule.agreement_id,
  )!.currency;
  return (
    Math.max(
      0,
      units(schedule.amount, currency) +
        units(schedule.fee, currency) -
        units(paid(store, schedule), currency),
    ) / scale(currency)
  );
}
export function scheduleStatus(
  store: InstallmentStore,
  row: Schedule,
  today: string,
): string {
  if (
    row.voided ||
    store.agreements.find((a) => a.id === row.agreement_id)?.cancelled
  )
    return "cancelled";
  if (!balance(store, row)) return "paid";
  if (row.due_date < today) return "overdue";
  if (paid(store, row)) return "partial";
  return row.due_date === today ? "due" : "upcoming";
}
export function agreementStatus(
  store: InstallmentStore,
  a: Agreement,
  today: string,
): string {
  if (a.cancelled) return "cancelled";
  const rows = store.schedules.filter(
    (s) => s.agreement_id === a.id && !s.voided,
  );
  if (rows.every((s) => balance(store, s) === 0)) return "completed";
  return rows.some((s) => scheduleStatus(store, s, today) === "overdue")
    ? "overdue"
    : "active";
}
export function applyCommand(
  original: InstallmentStore,
  command: Command,
  customers: Customer[],
  catalog: OrganiserCatalog,
  actor: string,
  now: string,
  makeId: () => string = () => crypto.randomUUID(),
): InstallmentStore {
  const id = (_prefix: string) => makeId();
  const store = structuredClone(original);
  const today = businessDate(now);
  const audit = (action: string, reason: string, agreement_id?: string) =>
    store.audit.unshift({
      id: id("AUD"),
      action,
      reason,
      ...(agreement_id ? { agreement_id } : {}),
      actor,
      created_at: now,
    });
  const agreement = (key: string) => {
    const a = store.agreements.find((a) => a.id === key);
    check(a, "Agreement not found.");
    return a;
  };
  const active = (a: Agreement) =>
    check(!a.cancelled, "This agreement is cancelled.");
  const schedule = (key: string) => {
    const row = store.schedules.find((s) => s.id === key);
    check(row && !row.voided, "Active schedule not found.");
    active(agreement(row.agreement_id));
    return row;
  };
  switch (command.type) {
    case "save_plan": {
      const name = text(command.name, "Repayment plan name");
      const description = text(command.description, "Description");
      const terms = validateTerms(command.terms);
      const p = command.id
        ? store.plans.find((p) => p.id === command.id)
        : undefined;
      check(!command.id || p, "Repayment plan not found.");
      if (p) Object.assign(p, { name, description, terms });
      else
        store.plans.push({
          id: id("REPAY"),
          name,
          description,
          active: true,
          terms,
        });
      audit(p ? "Repayment plan edited" : "Repayment plan created", name);
      break;
    }
    case "toggle_plan": {
      const p = store.plans.find((p) => p.id === command.id);
      check(p, "Repayment plan not found.");
      p.active = !p.active;
      audit(
        p.active ? "Repayment plan activated" : "Repayment plan deactivated",
        p.name,
      );
      break;
    }
    case "assign": {
      check(
        customers.some((c) => c.id === command.customer_id),
        "Select an existing customer.",
      );
      const p = command.plan_id
        ? store.plans.find((p) => p.id === command.plan_id)
        : null;
      check(!command.plan_id || p?.active, "Select an active repayment plan.");
      const terms = validateTerms(p?.terms ?? command.terms);
      let total = command.total_amount;
      let currency = command.currency;
      let productName = text(command.product_name, "Purchase name");
      integer(command.quantity, "Quantity", 1, 100);
      if (command.product_id) {
        validateOrganiserCatalog(catalog);
        const purchase = organiserPurchase(
          catalog,
          command.product_id,
          command.quantity,
        );
        check(
          command.currency === catalog.currency &&
            command.total_amount === purchase.total,
          "The organiser plan price changed. Review the updated preview before confirming.",
        );
        total = purchase.total;
        currency = catalog.currency;
        productName = purchase.plan.name;
      }
      const rows = preview(terms, total, currency, command.start_date);
      const a: Agreement = {
        id: id("AGR"),
        customer_id: command.customer_id,
        plan_id: p?.id ?? null,
        product_id: command.product_id,
        product_name: productName,
        quantity: command.quantity,
        total_amount: total,
        currency,
        terms,
        start_date: command.start_date,
        created_at: now,
        cancelled: false,
      };
      store.agreements.push(a);
      store.schedules.push(
        ...rows.map((s) => ({ ...s, id: id("SCH"), agreement_id: a.id })),
      );
      audit(
        "Agreement created",
        `${productName} · ${money(total, currency)}`,
        a.id,
      );
      break;
    }
    case "pay": {
      const row = schedule(command.schedule_id);
      const a = agreement(row.agreement_id);
      check(
        a.id === command.agreement_id,
        "Schedule does not belong to this agreement.",
      );
      const amount = units(command.amount, a.currency);
      const remaining = units(balance(store, row), a.currency);
      check(
        amount > 0 && amount <= remaining,
        "Payment must be positive and cannot exceed the outstanding balance.",
      );
      check(
        a.terms.partial_payment || amount === remaining,
        "This agreement does not allow partial payments.",
      );
      check(
        a.terms.early_payment || row.due_date <= today,
        "This agreement does not allow early payments.",
      );
      const reference = text(
        command.transaction_reference,
        "Transaction reference",
      );
      check(
        !store.payments.some(
          (p) =>
            p.transaction_reference.toLowerCase() === reference.toLowerCase(),
        ),
        "This transaction reference was already recorded.",
      );
      store.payments.push({
        id: id("PAY"),
        agreement_id: a.id,
        schedule_id: row.id,
        amount: command.amount,
        refunded: 0,
        payment_method: text(command.payment_method, "Payment method"),
        transaction_reference: reference,
        created_at: now,
      });
      audit("Payment recorded", reference, a.id);
      break;
    }
    case "refund": {
      const p = store.payments.find((p) => p.id === command.payment_id);
      check(p, "Payment not found.");
      const a = agreement(p.agreement_id);
      const amount = units(command.amount, a.currency);
      const reason = text(command.reason, "Refund reason");
      check(
        amount > 0 &&
          amount <= units(p.amount, a.currency) - units(p.refunded, a.currency),
        "Refund exceeds the remaining refundable amount.",
      );
      p.refunded = (units(p.refunded, a.currency) + amount) / scale(a.currency);
      store.refunds.push({
        id: id("REF"),
        payment_id: p.id,
        amount: command.amount,
        reason,
        created_at: now,
      });
      audit("Refund recorded", reason, a.id);
      break;
    }
    case "revise": {
      const a = agreement(command.agreement_id);
      active(a);
      const reason = text(command.reason, "Revision reason");
      integer(command.new_installment_count, "Installment count", 1, 120);
      validDate(command.new_start_date);
      const rows = store.schedules.filter(
        (s) => s.agreement_id === a.id && !s.voided,
      );
      const remaining =
        rows.reduce((n, s) => n + units(balance(store, s), a.currency), 0) /
        scale(a.currency);
      check(remaining > 0, "Completed agreements cannot be revised.");
      const next = preview(
        {
          ...a.terms,
          initial_payment: 0,
          interest: 0,
          installment_count: command.new_installment_count,
        },
        remaining,
        a.currency,
        command.new_start_date,
      );
      for (const row of rows)
        if (balance(store, row) > 0) {
          row.amount = paid(store, row);
          row.fee = 0;
          row.voided = row.amount === 0;
        }
      store.schedules.push(
        ...next.map((s) => ({ ...s, id: id("SCH"), agreement_id: a.id })),
      );
      a.start_date = command.new_start_date;
      a.terms.installment_count = command.new_installment_count;
      audit(
        "Agreement revised",
        `${reason} · ${command.new_installment_count} installments from ${command.new_start_date}`,
        a.id,
      );
      break;
    }
    case "cancel": {
      const a = agreement(command.agreement_id);
      active(a);
      a.cancelled = true;
      audit(
        "Agreement cancelled",
        text(command.reason, "Cancellation reason"),
        a.id,
      );
      break;
    }
    case "due_date": {
      const row = schedule(command.schedule_id);
      check(balance(store, row) > 0, "Paid schedules cannot be adjusted.");
      const reason = text(command.reason, "Adjustment reason");
      validDate(command.new_due_date);
      const before = row.due_date;
      row.due_date = command.new_due_date;
      audit(
        "Due date adjusted",
        `${before} → ${row.due_date}: ${reason}`,
        row.agreement_id,
      );
      break;
    }
    case "fee": {
      const row = schedule(command.schedule_id);
      const a = agreement(row.agreement_id);
      const reason = text(command.reason, "Fee reason");
      check(
        command.fee_type === "fixed" || command.fee_type === "percentage",
        "Select a valid fee type.",
      );
      number(
        command.fee_amount,
        "Fee amount",
        0.000001,
        command.fee_type === "percentage" ? 100 : 1e9,
      );
      const eligible = new Date(`${row.due_date}T00:00:00Z`);
      eligible.setUTCDate(eligible.getUTCDate() + a.terms.grace_period_days);
      check(
        balance(store, row) > 0 && eligible.toISOString().slice(0, 10) < today,
        "Late fees require an unpaid installment beyond its grace period.",
      );
      check(!row.fee, "A late fee is already applied.");
      const fee =
        command.fee_type === "fixed"
          ? units(command.fee_amount, a.currency)
          : percentage(
              units(balance(store, row), a.currency),
              command.fee_amount,
            );
      check(fee > 0, "The fee rounds to zero for this currency.");
      row.fee = fee / scale(a.currency);
      audit(
        "Late fee applied",
        `${reason} · ${money(row.fee, a.currency)}`,
        a.id,
      );
      break;
    }
    case "notify": {
      const row = schedule(command.schedule_id);
      const a = agreement(row.agreement_id);
      const c = customers.find((c) => c.id === a.customer_id);
      check(c, "Customer not found.");
      check(
        balance(store, row) > 0,
        "Paid installments do not need reminders.",
      );
      check(
        command.notification_type === "reminder" ||
          command.notification_type === "overdue",
        "Select a valid notification type.",
      );
      check(
        command.notification_type !== "overdue" || row.due_date < today,
        "An overdue notification needs an overdue installment.",
      );
      check(
        Array.isArray(command.channels) &&
          command.channels.length > 0 &&
          command.channels.every((v) => v === "sms" || v === "email"),
        "Select SMS or Email.",
      );
      check(
        !command.channels.includes("sms") || c.phone,
        "This customer has no phone number.",
      );
      check(
        !command.channels.includes("email") || c.email,
        "This customer has no email address.",
      );
      store.notices.unshift({
        id: id("NTF"),
        agreement_id: a.id,
        schedule_id: row.id,
        type: command.notification_type,
        channels: [...new Set(command.channels)],
        status: "simulated",
        created_at: now,
      });
      audit("Notification simulated", command.notification_type, a.id);
      break;
    }
    default:
      throw new Error("Unknown installment operation.");
  }
  return store;
}
// Validate persisted demo records before deriving balances or accepting changes.
export function parseInstallmentStore(raw: string | null): InstallmentStore {
  if (!raw) return initialInstallmentStore();
  const s: InstallmentStore = JSON.parse(raw);
  check(
    s?.version === 1 &&
      [
        s.plans,
        s.agreements,
        s.schedules,
        s.payments,
        s.refunds,
        s.notices,
        s.audit,
      ].every(Array.isArray),
    "Saved installment data has an unsupported format.",
  );
  for (const rows of [
    s.plans,
    s.agreements,
    s.schedules,
    s.payments,
    s.refunds,
    s.notices,
    s.audit,
  ]) {
    check(
      new Set(rows.map((r) => r.id)).size === rows.length,
      "Duplicate record identifiers in saved data.",
    );
    for (const row of rows) text(row.id, "Record ID");
  }
  for (const row of [
    ...s.agreements,
    ...s.payments,
    ...s.refunds,
    ...s.notices,
    ...s.audit,
  ])
    check(
      typeof row.created_at === "string" &&
        Number.isFinite(Date.parse(row.created_at)),
      "Invalid saved timestamp.",
    );
  for (const p of s.plans) {
    text(p.id, "Plan ID");
    text(p.name, "Repayment plan name");
    text(p.description, "Description");
    validateTerms(p.terms);
    check(typeof p.active === "boolean", "Invalid plan state.");
  }
  for (const a of s.agreements) {
    text(a.id, "Agreement ID");
    text(a.customer_id, "Customer ID");
    text(a.product_name, "Purchase name");
    units(a.total_amount, a.currency);
    validDate(a.start_date);
    validateTerms(a.terms);
    check(typeof a.cancelled === "boolean", "Invalid agreement state.");
  }
  for (const row of s.schedules) {
    const a = s.agreements.find((a) => a.id === row.agreement_id);
    check(a, "Schedule agreement missing.");
    validDate(row.due_date);
    units(row.amount, a.currency);
    units(row.fee, a.currency);
    check(
      typeof row.voided === "boolean" && typeof row.initial === "boolean",
      "Invalid schedule state.",
    );
  }
  for (const p of s.payments) {
    const a = s.agreements.find((a) => a.id === p.agreement_id);
    check(
      a &&
        s.schedules.some(
          (row) => row.id === p.schedule_id && row.agreement_id === a.id,
        ),
      "Payment schedule missing.",
    );
    units(p.amount, a.currency);
    units(p.refunded, a.currency);
    check(p.amount > 0 && p.refunded <= p.amount, "Invalid payment amount.");
    text(p.transaction_reference, "Payment reference");
  }
  for (const r of s.refunds) {
    const p = s.payments.find((p) => p.id === r.payment_id);
    check(p, "Refund payment missing.");
    units(
      r.amount,
      s.agreements.find((a) => a.id === p.agreement_id)!.currency,
    );
  }
  for (const n of s.notices)
    check(
      s.schedules.some(
        (row) =>
          row.id === n.schedule_id && row.agreement_id === n.agreement_id,
      ) && Array.isArray(n.channels),
      "Invalid saved reminder.",
    );
  check(
    new Set(s.payments.map((p) => p.transaction_reference.toLowerCase()))
      .size === s.payments.length,
    "Duplicate saved transaction reference.",
  );
  for (const a of s.agreements)
    check(
      s.schedules.some((row) => row.agreement_id === a.id && !row.voided),
      "Agreement schedule missing.",
    );
  for (const p of s.payments) {
    const currency = s.agreements.find(
      (a) => a.id === p.agreement_id,
    )!.currency;
    check(
      s.refunds
        .filter((r) => r.payment_id === p.id)
        .reduce((sum, r) => sum + units(r.amount, currency), 0) ===
        units(p.refunded, currency),
      "Refund history does not match the receipt.",
    );
  }
  return s;
}

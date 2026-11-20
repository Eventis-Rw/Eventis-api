export type Frequency = "weekly" | "monthly" | "yearly";
export interface Terms {
  frequency: Frequency;
  interval: number;
  installment_count: number;
  initial_payment: number;
  interest: number;
  late_fee: number;
  grace_period_days: number;
  partial_payment: boolean;
  early_payment: boolean;
}
export const DEFAULT_TERMS: Terms = {
  frequency: "monthly",
  interval: 1,
  installment_count: 4,
  initial_payment: 0,
  interest: 0,
  late_fee: 0,
  grace_period_days: 5,
  partial_payment: true,
  early_payment: true,
};
export interface RepaymentPlan {
  id: string;
  name: string;
  description: string;
  active: boolean;
  terms: Terms;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}
export interface Agreement {
  id: string;
  customer_id: string;
  plan_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  total_amount: number;
  currency: string;
  terms: Terms;
  start_date: string;
  created_at: string;
  cancelled: boolean;
}
export interface Schedule {
  id: string;
  agreement_id: string;
  number: number;
  due_date: string;
  amount: number;
  fee: number;
  initial: boolean;
  voided: boolean;
}
export interface Payment {
  id: string;
  agreement_id: string;
  schedule_id: string;
  amount: number;
  refunded: number;
  payment_method: string;
  transaction_reference: string;
  created_at: string;
}
export interface Refund {
  id: string;
  payment_id: string;
  amount: number;
  reason: string;
  created_at: string;
}
export interface Notice {
  id: string;
  agreement_id: string;
  schedule_id: string;
  type: "reminder" | "overdue";
  channels: ("sms" | "email")[];
  created_at: string;
  status: "simulated" | "pending" | "sent" | "failed";
}
export interface Audit {
  id: string;
  agreement_id?: string;
  action: string;
  reason: string;
  actor: string;
  created_at: string;
}
export interface InstallmentStore {
  version: 1;
  plans: RepaymentPlan[];
  agreements: Agreement[];
  schedules: Schedule[];
  payments: Payment[];
  refunds: Refund[];
  notices: Notice[];
  audit: Audit[];
}
export type Command =
  | {
      type: "save_plan";
      id?: string;
      name: string;
      description: string;
      terms: Terms;
    }
  | { type: "toggle_plan"; id: string }
  | {
      type: "assign";
      customer_id: string;
      plan_id: string | null;
      product_id: string | null;
      product_name: string;
      quantity: number;
      total_amount: number;
      currency: string;
      start_date: string;
      terms: Terms;
    }
  | {
      type: "revise";
      agreement_id: string;
      new_start_date: string;
      new_installment_count: number;
      reason: string;
    }
  | { type: "cancel"; agreement_id: string; reason: string }
  | {
      type: "pay";
      agreement_id: string;
      schedule_id: string;
      amount: number;
      payment_method: string;
      transaction_reference: string;
    }
  | { type: "refund"; payment_id: string; amount: number; reason: string }
  | {
      type: "due_date";
      schedule_id: string;
      new_due_date: string;
      reason: string;
    }
  | {
      type: "fee";
      schedule_id: string;
      fee_type: "fixed" | "percentage";
      fee_amount: number;
      reason: string;
    }
  | {
      type: "notify";
      schedule_id: string;
      notification_type: "reminder" | "overdue";
      channels: ("sms" | "email")[];
    };

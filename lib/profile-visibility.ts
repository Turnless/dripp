import { z } from "zod";

/**
 * What a user's public page (/u/<handle>) shows, chosen on Profile under
 * "What people see". Stored as one column per option on `users`.
 */
export type ProfileVisibility = {
  received: boolean;
  sent: boolean;
  tipCounts: boolean;
  subscribers: boolean;
};

export const VISIBILITY_OPTIONS: { key: keyof ProfileVisibility; column: string; label: string; detail: string }[] = [
  { key: "received", column: "show_received", label: "Total received", detail: "Everything people have tipped you" },
  { key: "sent", column: "show_sent", label: "Total tipped out", detail: "Everything you've tipped others" },
  { key: "tipCounts", column: "show_tip_counts", label: "Number of tips", detail: "How many tips are behind each total" },
  { key: "subscribers", column: "show_subscribers", label: "Subscriber count", detail: "Your YouTube subscribers, live" },
];

/**
 * Reads the options from a `users` row. Anything missing counts as hidden,
 * so a row read before the migration (or a failed read) never exposes totals.
 */
export function visibilityFromRow(row: Record<string, unknown> | null | undefined): ProfileVisibility {
  const on = (column: string) => row?.[column] === true;
  return {
    received: on("show_received"),
    sent: on("show_sent"),
    tipCounts: on("show_tip_counts"),
    subscribers: on("show_subscribers"),
  };
}

/** A PATCH body: any subset of the options. */
export const VisibilityPatchSchema = z
  .object({
    received: z.boolean(),
    sent: z.boolean(),
    tipCounts: z.boolean(),
    subscribers: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

/** Column updates for a validated patch. */
export function visibilityColumns(patch: Partial<ProfileVisibility>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const o of VISIBILITY_OPTIONS) {
    const v = patch[o.key];
    if (typeof v === "boolean") out[o.column] = v;
  }
  return out;
}

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/privy-server", () => ({ privy: () => ({}) }));

import { mayWithdrawToAddress } from "@/lib/withdraw-access";

afterEach(() => {
  delete process.env.WITHDRAW_TO_ADDRESS_EMAILS;
});

describe("withdraw to a wallet address", () => {
  it("is off for everyone when the list is unset", () => {
    expect(mayWithdrawToAddress("a@example.com")).toBe(false);
  });

  it("allows only listed emails, ignoring case and spaces", () => {
    process.env.WITHDRAW_TO_ADDRESS_EMAILS = " Tester@Example.com , other@example.com";
    expect(mayWithdrawToAddress("tester@example.com")).toBe(true);
    expect(mayWithdrawToAddress("OTHER@example.com ")).toBe(true);
    expect(mayWithdrawToAddress("someone@example.com")).toBe(false);
    expect(mayWithdrawToAddress(null)).toBe(false);
  });

  it('"*" allows everyone', () => {
    process.env.WITHDRAW_TO_ADDRESS_EMAILS = "*";
    expect(mayWithdrawToAddress("anyone@example.com")).toBe(true);
  });
});

import { visibilityFromRow } from "@/lib/profile-visibility";

describe("public profile options", () => {
  it("shows only what's switched on", () => {
    expect(
      visibilityFromRow({ show_received: true, show_sent: false, show_tip_counts: false, show_subscribers: true })
    ).toEqual({ received: true, sent: false, tipCounts: false, subscribers: true });
  });

  it("hides everything when the row is missing or not migrated yet", () => {
    const hidden = { received: false, sent: false, tipCounts: false, subscribers: false };
    expect(visibilityFromRow(null)).toEqual(hidden);
    expect(visibilityFromRow({ id: "u1" })).toEqual(hidden);
  });
});

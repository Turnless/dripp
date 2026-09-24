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

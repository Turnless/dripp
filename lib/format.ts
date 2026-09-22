// Money is handled as integer cents in the UI (design.md section 11).

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}

/** "5", "5.5", "$5.50" -> 550. Returns null for anything that isn't a whole-cent amount. */
export function parseUsdToCents(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
}

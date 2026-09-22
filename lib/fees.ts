/**
 * dripp's only fee: 1% of each WITHDRAWAL, in basis points (100 = 1%).
 * Tips are free -- the recipient gets the full amount sent.
 *
 * Withdrawals aren't built yet; when they are, the server must use this same
 * constant so the amount shown before confirming is exactly what happens.
 */
export const WITHDRAWAL_FEE_BPS = 100;

export function withdrawalFee(amountCents: number) {
  const fee = Math.round((amountCents * WITHDRAWAL_FEE_BPS) / 10_000);
  return { fee, receive: amountCents - fee };
}

export const WITHDRAWAL_FEE_PERCENT = `${WITHDRAWAL_FEE_BPS / 100}%`;

/** Largest single tip, in cents. Keep in sync with MAX_TIP_USD in app/api/tip/route.ts. */
export const MAX_TIP_CENTS = 1000_00;

/** Most recipients in one bulk send. */
export const MAX_BULK_RECIPIENTS = 50;

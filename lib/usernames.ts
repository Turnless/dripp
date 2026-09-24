/**
 * dripp usernames (@name): anyone can be tipped by one, no channel needed.
 * The database enforces the format and uniqueness (users.username, and
 * set_username in supabase/functions.sql, which also limits changes to one
 * every 30 days and holds an old name for 30 days). This file adds the
 * friendly checks the UI shows and words nobody may take.
 */

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;
export const USERNAME_CHANGE_DAYS = 30;

// Names that could be mistaken for dripp itself, a role, or a system page.
const RESERVED = new Set([
  "admin", "administrator", "api", "app", "billing", "creator", "dripp", "drippapp", "help", "login",
  "logout", "me", "mod", "moderator", "official", "overlay", "privacy", "profile", "root", "security",
  "settings", "signin", "signup", "staff", "support", "system", "team", "terms", "tip", "tips", "u",
  "user", "verify", "viewer", "wallet", "www",
]);

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: string };

/** Normalizes (trim, drop "@", lowercase) and checks a username the user typed. */
export function checkUsername(raw: string): UsernameCheck {
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  if (username.length < 3) return { ok: false, error: "At least 3 characters." };
  if (username.length > 20) return { ok: false, error: "At most 20 characters." };
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Use only letters, numbers, _ and ." };
  }
  if (/^[._]|[._]$/.test(username) || /[._]{2}/.test(username)) {
    return { ok: false, error: "Start and end with a letter or number, with no double . or _" };
  }
  if (RESERVED.has(username) || username.startsWith("dripp")) {
    return { ok: false, error: "That username isn't available." };
  }
  return { ok: true, username };
}

/** A starting suggestion from someone's name ("Maya O'Neil" -> "mayaoneil"). */
export function suggestUsername(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
  const check = checkUsername(base);
  return check.ok ? check.username : "";
}

/** Plain-English reasons for set_username's outcomes. */
export const SET_USERNAME_ERRORS: Record<string, { error: string; status: number }> = {
  invalid: { error: "Use 3-20 letters, numbers, _ or .", status: 400 },
  taken: { error: "That username is taken. Try another.", status: 409 },
  held: { error: "That username was used recently. Try another.", status: 409 },
  too_soon: { error: `You can change your username once every ${USERNAME_CHANGE_DAYS} days.`, status: 409 },
};

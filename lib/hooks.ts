"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** fetch() that attaches the Privy access token -- how every API route identifies the caller. */
export function useAuthedFetch() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (input: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
      const token = await getAccessToken();
      return fetch(input, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    },
    [getAccessToken]
  );
}

/** Reads an error message from an API response, falling back to plain English. */
export async function readError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (typeof json?.error === "string") return json.error;
  } catch {}
  return "Something went wrong. Please try again.";
}

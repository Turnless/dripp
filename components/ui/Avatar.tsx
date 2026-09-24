"use client";

import { useState } from "react";

/**
 * Profile picture: the linked channel's picture when there is one, otherwise
 * the first letter of the name on the brand gradient (also used if the
 * picture fails to load).
 */
export function Avatar({
  src,
  name,
  className = "h-10 w-10 text-[0.9375rem]",
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim().charAt(0) || "D").toUpperCase();

  if (src && !failed) {
    return (
      // Channel pictures come from the platform's CDN (any host), so a plain
      // <img> rather than next/image, which needs every host configured.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-brand font-bold text-text ${className}`}
    >
      {initial}
    </span>
  );
}

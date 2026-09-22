type Level = "thin" | "regular" | "thick";

const levels: Record<Level, string> = {
  thin: "glass-thin rounded-chip",
  regular: "glass rounded-card",
  thick: "glass-thick rounded-sheet",
};

/** A glass surface. Never nest one GlassCard inside another (design.md 4.2). */
export function GlassCard({
  level = "regular",
  className = "",
  as: Tag = "div",
  children,
  ...rest
}: {
  level?: Level;
  as?: "div" | "section" | "article" | "aside";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`${levels[level]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

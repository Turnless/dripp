import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-primary hover:bg-primary-hover",
  secondary: "glass-thin text-text hover:bg-text/5",
  outline: "bg-transparent text-text ring-[1.5px] ring-inset ring-text hover:bg-text/[0.06]",
  ghost: "text-text hover:bg-text/5",
  destructive: "bg-negative text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, fullWidth, className = "", children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`pressable relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {/* Keep the label in the layout while loading so the button never changes width. */}
      <span className={`inline-flex items-center gap-2 ${loading ? "invisible" : ""}`}>{children}</span>
      {loading && <Loader2 className="absolute h-5 w-5 animate-spin" aria-hidden />}
    </button>
  );
});

import type { Config } from "tailwindcss";

// Colors come from the CSS tokens in app/globals.css (design.md section 2).
// No raw hex values in components.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        text: token("text"),
        muted: token("text-muted"),
        emphasis: token("text-emphasis"),
        solid: token("surface-solid"),
        primary: token("primary"),
        "primary-hover": token("primary-hover"),
        tint: token("tint"),
        brand: token("brand"),
        "on-brand": token("on-brand"),
        "on-primary": token("on-primary"),
        deep: token("deep"),
        positive: token("positive"),
        negative: token("negative"),
        caution: token("caution"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        chip: "12px",
        card: "20px",
        sheet: "28px",
      },
      fontSize: {
        money: ["clamp(3rem, 12vw, 5rem)", { lineHeight: "1", letterSpacing: "-0.045em", fontWeight: "800" }],
        "title-1": ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "800" }],
        "title-2": ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "700" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "500" }],
        label: ["0.75rem", { lineHeight: "1.3", letterSpacing: "0.04em", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};

export default config;

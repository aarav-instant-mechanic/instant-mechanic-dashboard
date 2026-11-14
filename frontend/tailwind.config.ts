import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { yellow: "#FFCC00", orange: "#FF7900", deep: "#E65C00", tint: "#FFF1DC" },
        canvas: "#FFF9EF", ink: "#202124", muted: "#667085", line: "#EAEAEA",
        ok: "#1E8E4E", okbg: "#E7F6EC", alert: "#C62828",
      },
      fontFamily: {
        display: ['"Barlow Semi Condensed"', '"Arial Narrow"', "Arial", "sans-serif"],
        sans: ["Figtree", '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(32,33,36,.05)" },
    },
  },
  plugins: [],
};
export default config;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Official brand palette, aligned to the design handoff (styles/brand.css):
        //   Charcoal #2f2f2d · White #ffffff · Verde Chiaro #e6ebdb
        // Token names kept stable (ink/paper/brass/rust) so existing class
        // usages keep working: ink=charcoal, paper=white, brass=verde chiaro.
        ink: {
          DEFAULT: "#2f2f2d", // charcoal — primary (text, dark bands, buttons)
          soft: "#4a4a47", // body text
          muted: "#74746e", // secondary / label text
        },
        black: "#161614", // max contrast / gallery hall
        paper: {
          DEFAULT: "#ffffff", // white cards/surfaces & page
          dim: "#fafaf8", // faint surface
          warm: "#f4f6ee", // verde-tinted neutral band
          card: "#ffffff", // white cards (legacy alias)
        },
        // "brass" token = Verde Chiaro accent (signature light green + page bg).
        // `dark` maps to charcoal so accent TEXT/links stay readable.
        brass: {
          DEFAULT: "#e6ebdb", // verde chiaro fill
          light: "#e6ebdb",
          dark: "#2f2f2d", // charcoal (for accent text/links/eyebrows on white)
        },
        verde: {
          DEFAULT: "#e6ebdb", // verde chiaro — signature accent + page background
          mid: "#cdd6bb", // duotone mid
          deep: "#8a9472", // sage — eyebrows, accents, active dots
        },
        line: {
          DEFAULT: "rgba(47,47,45,0.14)", // hairline border
          strong: "rgba(47,47,45,0.28)", // stronger border
        },
        // Functional-only alert color (errors / destructive). Not a brand color.
        rust: "#9c4a2e",
      },
      fontFamily: {
        // Brand typeface: Josefin Sans for both display and body.
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        // Admin UI typeface: Inter.
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1240px",
      },
      boxShadow: {
        // Soft, airy elevation for the admin's light surfaces.
        card: "0 1px 2px rgba(47,47,45,0.04), 0 6px 20px -8px rgba(47,47,45,0.10)",
        "card-hover":
          "0 2px 4px rgba(47,47,45,0.05), 0 12px 28px -10px rgba(47,47,45,0.16)",
        sheet: "0 -8px 30px -12px rgba(47,47,45,0.25)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.35s cubic-bezier(0.21,0.6,0.35,1) both",
        "slide-up": "slide-up 0.28s cubic-bezier(0.21,0.6,0.35,1) both",
        "toast-in": "toast-in 0.3s cubic-bezier(0.21,0.6,0.35,1) both",
        "fade-in": "fade-in 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};

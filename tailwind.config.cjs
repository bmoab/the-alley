/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Official brand palette (TheAlley_BrandGuide.pdf):
        //   Primary  — Charcoal      #333333  (~47.5%)
        //   Secondary— White         #FFFFFF  (~47.5%)
        //   Tertiary — Verde Chiaro  #E6EBDB  (~5%, accent only — light green
        //              that reads as a FILL, not as text/links)
        // Token names kept stable (ink/paper/brass/rust) so existing class
        // usages keep working: ink=charcoal, paper=white, brass=verde chiaro.
        ink: {
          DEFAULT: "#333333", // charcoal — primary
          soft: "#454545", // slightly lighter charcoal (hovers)
          muted: "#6f6f6a", // muted gray for secondary text on white
        },
        paper: {
          DEFAULT: "#fafaf9", // near-white page background
          warm: "#f0f2ea", // faint verde-tinted neutral for alternating bands
          card: "#ffffff", // white cards
        },
        // "brass" token = Verde Chiaro accent. Light green: use as a fill
        // (badges, accent buttons, highlights). `dark` maps to charcoal so any
        // accent TEXT/links stay readable and on-brand (the brand has one green).
        brass: {
          DEFAULT: "#e6ebdb", // verde chiaro fill
          light: "#e6ebdb", // verde chiaro (legible on charcoal backgrounds)
          dark: "#333333", // charcoal (for accent text/links/eyebrows on white)
        },
        // Functional-only alert color (errors / destructive). Not a brand color.
        rust: "#9c4a2e",
      },
      fontFamily: {
        // Brand typeface: Josefin Sans (Semibold display, Light/Regular body).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1180px",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette (matched to alleyoncenter.com): soft sage-green paper,
        // near-black charcoal ink, muted olive accent. Token names kept stable
        // so existing class usages (text-brass-dark, bg-paper, etc.) still work.
        ink: {
          DEFAULT: "#1a1a16",
          soft: "#272722",
          muted: "#585c4d",
        },
        paper: {
          DEFAULT: "#dfe4d3", // sage page background
          warm: "#d3dac3", // slightly deeper sage for alternating sections
          card: "#f2f4ea", // near-white sage tint for cards
        },
        // "brass" kept as the accent token name, recolored to a muted olive so
        // accents read as on-theme rather than gold.
        brass: {
          DEFAULT: "#6f7553",
          light: "#8a8f6d",
          dark: "#4d5238",
        },
        rust: "#9c4a2e",
      },
      fontFamily: {
        display: ["var(--font-display)", "Archivo", "system-ui", "sans-serif"],
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        content: "1180px",
      },
    },
  },
  plugins: [],
};

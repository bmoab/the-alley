/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Enables native-style CSS nesting so the public-site design system can be
    // scoped under `.dir-b` without colliding with the admin styles.
    "tailwindcss/nesting": {},
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;

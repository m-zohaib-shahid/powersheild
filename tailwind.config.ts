import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px -24px rgba(0, 0, 0, 0.9)",
        fab: "0 18px 36px -14px rgba(5, 150, 105, 0.55)",
        tab: "0 8px 20px -10px rgba(5, 150, 105, 0.7)",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16181d", muted: "#5b6270", faint: "#8a919e" },
        line: { DEFAULT: "#e3e5ea", strong: "#cbd0d8" },
        surface: { DEFAULT: "#ffffff", sunken: "#f6f7f9", raised: "#fbfbfc" },
        // The single accent. Used only for agent activity and agent decisions.
        agent: { DEFAULT: "#3b4ce0", soft: "#eef0fd", line: "#c3c9f6" },
        flag: { DEFAULT: "#a8621b", soft: "#fdf3e7", line: "#f0d7b5" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "18px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
      },
    },
  },
  plugins: [],
};

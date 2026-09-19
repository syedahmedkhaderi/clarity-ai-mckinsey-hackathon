/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#151a22", muted: "#525b68", faint: "#5f6875" },
        line: { DEFAULT: "#d9dee6", strong: "#b8c0cc" },
        surface: { DEFAULT: "#ffffff", sunken: "#f3f5f8", raised: "#f8f9fb" },
        // The LMS sidebar. A cool institutional grey, one step darker than the page
        // ground, so the portal's own navigation reads apart from LOOP's white rails.
        shell: { DEFAULT: "#e8ecf1", line: "#d0d7e0" },
        // The accent. Navy, so the LOOP panels read as one tool against the plain shell.
        // Used for agent activity, agent decisions and the primary action on a page.
        agent: { DEFAULT: "#1d3d6b", soft: "#e7edf6", line: "#c3d0e4" },
        // Things the agent handed to a human.
        flag: { DEFAULT: "#8d4d0b", soft: "#fbf0e2", line: "#e9cfa6" },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
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

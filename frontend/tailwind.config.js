/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#151a22", muted: "#525b68", faint: "#5f6875" },
        line: { DEFAULT: "#d9dee6", strong: "#b8c0cc" },
        // head: a panel's title band, one clear step below white so each section reads
        // as its own block. inset: a quoted block inside a white card.
        surface: { DEFAULT: "#ffffff", sunken: "#f3f5f8", raised: "#f8f9fb", head: "#eaeef3", inset: "#f1f3f7" },
        // The LMS sidebar. A cool institutional grey, one step darker than the page
        // ground, so the portal's own navigation reads apart from LOOP's white rails.
        shell: { DEFAULT: "#e8ecf1", line: "#d0d7e0" },
        // The top bar of the portal, and the helper button that sits on the same ground.
        bar: { DEFAULT: "#22262e", hover: "#343a45" },
        // The accent. Navy, so the LOOP panels read as one tool against the plain shell.
        // Used for agent activity, agent decisions and the primary action on a page.
        agent: { DEFAULT: "#1d3d6b", soft: "#e7edf6", line: "#c3d0e4" },
        // Things the agent handed to a human. A deep rust: solid where the teacher acts,
        // an outline where it only points the way.
        flag: { DEFAULT: "#8a3b12", soft: "#faf1ec", line: "#d9b8a5" },
        // Charts. Bright so a picture catches the eye before the numbers do, but each hue
        // keeps one meaning everywhere: blue is the ordinary mark, magenta is the one to
        // look at (a hard question, a whole-class mistake, a mistake that keeps coming
        // back), teal is a trend line. wash is the ground of a whole-class callout.
        chart: {
          DEFAULT: "#3aa8d6",
          light: "#6ccaf0",
          pale: "#d3eefa",
          hot: "#d81f6f",
          line: "#1784a8",
          track: "#e8ecf1",
          wash: "#e7f5fc",
          deep: "#0b5068",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
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

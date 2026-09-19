/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16151f", muted: "#545266", faint: "#615f73" },
        line: { DEFAULT: "#dddbe8", strong: "#bdbacd" },
        // head: a panel's title band, one clear step below white so each section reads
        // as its own block. inset: a quoted block inside a white card. The greys lean a
        // touch towards the violet accent so the page reads as one family.
        surface: { DEFAULT: "#ffffff", sunken: "#f5f4fa", raised: "#f9f8fc", head: "#eeecf6", inset: "#f3f2f8" },
        // The LMS sidebar. A cool institutional grey, one step darker than the page
        // ground, so the portal's own navigation reads apart from LOOP's white rails.
        shell: { DEFAULT: "#e8ecf1", line: "#d0d7e0" },
        // The top bar of the portal.
        bar: { DEFAULT: "#22262e", hover: "#343a45" },
        // The accent, a violet built on #6c5ce7. DEFAULT is a step deeper so white text
        // on it and violet text on `soft` both stay readable at small sizes. Used for
        // agent activity, agent decisions and the primary action on a page.
        agent: { DEFAULT: "#5a4bd6", hover: "#4a3cc0", soft: "#f1effd", line: "#d4cff8" },
        // Things the agent handed to a human. A deep rust: solid where the teacher acts,
        // an outline where it only points the way.
        flag: { DEFAULT: "#8a3b12", soft: "#faf1ec", line: "#d9b8a5" },
        // Priority on the action plan, and only there: red, amber, green, each as a soft
        // tint with dark text so it reads without shouting over the violet.
        priority: {
          high: "#b42318",
          "high-soft": "#fef0ef",
          "high-line": "#f5c2bd",
          medium: "#935f00",
          "medium-soft": "#fff6e0",
          "medium-line": "#f0d593",
          low: "#1d7a3e",
          "low-soft": "#ecf8f0",
          "low-line": "#b5e0c3",
        },
        // Charts. The same violet family as the accent, with one pink for the mark to
        // look at. Each hue keeps one meaning everywhere: violet is the ordinary mark,
        // pink is the one to look at (a whole-class mistake, a mistake that keeps coming
        // back), deep violet is a trend line or a confirmed mark. wash is the ground of
        // a whole-class callout.
        chart: {
          DEFAULT: "#6c5ce7",
          light: "#a29bfe",
          pale: "#e4e1fd",
          hot: "#d63384",
          "hot-strong": "#b82a70",
          line: "#4a3cc0",
          track: "#eceaf6",
          wash: "#f1effd",
          deep: "#3b2f9e",
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

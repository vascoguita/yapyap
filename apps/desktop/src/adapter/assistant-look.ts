/**
 * The assistant's colors in the message box and above it, as custom
 * properties on a shadow host. The assistant has an accent of its own, an
 * indigo, so nothing it draws passes for WhatsApp's green controls. The
 * host's `data-theme` follows WhatsApp's own theme, which can differ from
 * the system's. Every text color keeps 4.5:1 or more against the surface
 * it sits on, in both themes.
 */
export const ASSISTANT_THEME = `
:host {
  --ai: #4f46e5; --ai-tint: #eeedfc; --ai-border: #d9d6f7; --ai-split: #ffffff;
  --ai-hover: #e3e1fa; --area: #f7f5f3; --area-border: #e1ddd6; --chip: #ffffff;
  --chip-border: #d6d3cd; --text: #111b21; --muted: #54656f; --menu: #ffffff;
  --hover: #f2f1ef; --border: #e9e6e1; --shadow: rgb(17 27 33 / 18%);
}
:host([data-theme='dark']) {
  --ai: #a5b4fc; --ai-tint: #27264b; --ai-border: #3f3d7a; --ai-split: #1d1f1f;
  --ai-hover: #33325f; --area: #1d1f1f; --area-border: #2f3333; --chip: #242626;
  --chip-border: #3d4242; --text: #e9edef; --muted: #aebac1; --menu: #242626;
  --hover: #2f3232; --border: #383c3c; --shadow: rgb(0 0 0 / 50%);
}
`;

/** The assistant's stroke icons, on a 24 px grid, as SVG paths. */
export const ASSISTANT_ICONS = {
  /** A large four-pointed star and a small one: the assistant's own mark, and Polish. */
  sparkle:
    'M11 3c.6 4 2.2 5.5 6 6-3.8.5-5.4 2-6 6-.6-4-2.2-5.5-6-6 3.8-.5 5.4-2 6-6zM18.5 14.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z',
  /** Lines that get shorter. */
  shorten: 'M4 6h16M4 12h11M4 18h6',
  /** Lines with a plus: more of them. */
  elaborate: 'M4 6h16M4 12h16M4 18h8M17 15v6M14 18h6',
  /** A heart, for a gentler tone. */
  soften:
    'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  /** A briefcase, for a professional tone. */
  formalize: 'M4 8h16v11H4zM9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 13h16',
  /** A cog, for the assistant's settings. */
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10.4 3h3.2l.5 2.3 1.8 1 2.2-.7 1.6 2.8-1.7 1.6v2l1.7 1.6-1.6 2.8-2.2-.7-1.8 1-.5 2.3h-3.2l-.5-2.3-1.8-1-2.2.7-1.6-2.8L5.8 13v-2L4.1 9.4l1.6-2.8 2.2.7 1.8-1z',
  /** A chevron pointing up, since the menu opens upwards, above the message box. */
  caret: 'M6 15l6-6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  /** A cross, to dismiss. */
  close: 'M6 6l12 12M18 6L6 18',
} as const;

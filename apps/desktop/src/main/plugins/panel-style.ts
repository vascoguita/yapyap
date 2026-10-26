/**
 * The stylesheet every plugin panel starts with (#396), so a panel looks like
 * YapYap's own windows without the plugin shipping any CSS: system fonts,
 * YapYap's colors in light and dark, and plain form controls with a visible
 * focus ring. The `--yapyap-*` variables are part of the plugin API, so a
 * plugin's own stylesheet can build on them.
 */
export const PANEL_STYLE = `:root {
  color-scheme: light dark;
  --yapyap-surface: #ffffff;
  --yapyap-raised: #f4f3fb;
  --yapyap-text: #1c1b29;
  --yapyap-muted: #5b5a6e;
  --yapyap-accent: #3f2fb8;
  --yapyap-on-accent: #ffffff;
  --yapyap-border: #dcd9f2;
  --yapyap-danger: #b3261e;
  --yapyap-radius: 10px;
  font: 15px/1.45 system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --yapyap-surface: #17161f;
    --yapyap-raised: #211f2c;
    --yapyap-text: #f2f1fa;
    --yapyap-muted: #b0aec4;
    --yapyap-accent: #c9c3ff;
    --yapyap-on-accent: #17161f;
    --yapyap-border: #34324a;
    --yapyap-danger: #ffb4ab;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 20px;
  background: var(--yapyap-surface);
  color: var(--yapyap-text);
}
h1 { margin: 0 0 12px; font-size: 1.35rem; }
h2 { margin: 24px 0 10px; font-size: 1.05rem; }
h3 { margin: 18px 0 8px; font-size: 1rem; }
p { margin: 0 0 12px; }
small, .yapyap-muted { color: var(--yapyap-muted); }
a { color: var(--yapyap-accent); }
[role="status"] {
  padding: 10px 12px;
  border-radius: var(--yapyap-radius);
  background: var(--yapyap-raised);
  color: var(--yapyap-muted);
}
label { display: inline-flex; align-items: center; gap: 8px; margin: 0 12px 8px 0; }
input, select, textarea {
  font: inherit;
  color: inherit;
  padding: 7px 10px;
  border: 1px solid var(--yapyap-border);
  border-radius: 8px;
  background: var(--yapyap-surface);
}
input[type="checkbox"], input[type="radio"] { padding: 0; accent-color: var(--yapyap-accent); }
textarea { width: 100%; min-height: 6em; resize: vertical; }
button {
  font: inherit;
  padding: 7px 14px;
  margin: 0 6px 8px 0;
  border: 1px solid var(--yapyap-border);
  border-radius: 999px;
  background: var(--yapyap-raised);
  color: var(--yapyap-text);
  cursor: pointer;
}
button:hover { border-color: var(--yapyap-accent); }
button:disabled { opacity: 0.55; cursor: default; }
button.yapyap-primary {
  background: var(--yapyap-accent);
  border-color: var(--yapyap-accent);
  color: var(--yapyap-on-accent);
}
:focus-visible { outline: 2px solid var(--yapyap-accent); outline-offset: 2px; }
ul, ol { padding-inline-start: 0; list-style: none; }
li { margin: 0 0 6px; }
li > button { width: 100%; margin: 0; text-align: start; border-radius: var(--yapyap-radius); }
pre, code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}
pre {
  padding: 10px 12px;
  border-radius: var(--yapyap-radius);
  background: var(--yapyap-raised);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`;

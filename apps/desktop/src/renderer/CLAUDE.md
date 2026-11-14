# Chrome renderer: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- `pnpm dev` serves chrome pages from `out/renderer` too, never from the
  Vite dev server: `watchChromePages` in `electron.vite.config.ts`
  watch-builds them there. They have no hot reload; reopen a window to see
  an edit.

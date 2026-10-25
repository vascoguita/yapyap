# 0012. Translations

- Status: Proposed
- Date: 2026-10-25

## Context

All of YapYap's UI text lives in one typed catalog,
`apps/desktop/src/shared/messages/en.ts`, which lint enforces
(`yapyap/no-literal-ui-text`). It has about 800 lines, and 58 modules
import it. 48 of its entries are functions, because they take values
(`Remove ${name}?`) or choose an English plural by hand
(`count === 1 ? '1 unread chat' : …`). A few places format numbers and
dates with a fixed `'en'` locale, and the chrome pages declare
`<html lang="en">` and lay out with physical `left` and `right`.

#111 asks for a documented, Weblate-compatible translation workflow with CI
checks, a UI language that follows the system, can change without a
restart, and supports right-to-left languages. WhatsApp Web is not part of
this: it chooses its own language.

Translators work in tools such as Weblate, which edit data files, never
TypeScript, and a translation must never be able to run code.

## Decision

1. **Catalogs are JSON.** Each language is one file,
   `apps/desktop/src/shared/messages/locales/<tag>.json`, in the i18next
   JSON v4 format that Weblate reads and writes: keys nest like today's
   `en` object, values are plain strings, placeholders are `{{name}}`, and
   plurals are separate keys with CLDR suffixes (`unreadChats_one`,
   `unreadChats_other`, and `_few`, `_many` where a language needs them).
   English, `en.json`, is the source language.
2. **Call sites keep their shape.** A script in `scripts/` generates the
   TypeScript type of the catalog from `en.json`, and a small runtime turns
   any catalog into an object of the same shape as `en` today: strings stay
   strings, and entries with placeholders become functions with named,
   typed parameters. Plurals go through `Intl.PluralRules` for the active
   language. Values are inserted as text, never as markup, so a catalog
   cannot inject HTML or script. Modules import the active catalog instead
   of `en`, and the lint rule keeps working unchanged.
3. **Fallback is per key.** A key missing from a language, or one whose
   placeholders differ from English, falls back to English, so a partial
   translation is still usable and never breaks a sentence.
4. **The language follows the system.** A new setting, **Language**,
   defaults to **System** (`app.getPreferredSystemLanguages()`, first match
   among shipped catalogs, else English) and lists the shipped languages by
   their own names. Changing it applies at once: the main process rebuilds
   menus, the tray and notifications text, and every chrome window
   re-renders from the new catalog it receives over the chrome API.
5. **Right-to-left works by construction.** Chrome pages set `lang` and
   `dir` from the active language. Styles use logical properties
   (`margin-inline-start`, `text-align: start`), and a lint rule rejects
   physical `left`/`right` in chrome CSS. Numbers, sizes and dates go
   through `Intl` with the active language.
6. **CI checks every catalog.** A tested script fails a PR when a catalog
   is not valid JSON, has keys English lacks, has placeholders that differ
   from English, misses a plural form its language needs, or contains
   markup. E2E tests run the chrome under a generated pseudo-locale, with
   accented, longer text and right-to-left direction, so hard-coded text
   and broken layouts show up without a real translation.
7. **Translations arrive as pull requests.** Weblate, if used, commits to a
   branch and opens PRs like any contributor, and they pass the same
   checks. Only English ships until a language is complete enough to
   choose, which the maintainer decides per language.

### To decide before acceptance

- Whether to use hosted Weblate (free for libre projects; it needs an
  account and repository access, which only the maintainer can set up), or
  take translations only as ordinary pull requests at first.
- Which languages to seed first, if any, beyond English and the
  pseudo-locale.

## Consequences

- One mechanical migration: `en.ts` becomes `en.json` plus generated
  types, and 58 modules change their import. It lands in steps (runtime and
  checks first, then the move, then the setting, then right-to-left), each
  keeping the app fully in English and 100% covered.
- Plural and placeholder rules move from hand-written English code into
  data, which removes the English-only plural logic from the catalog.
- Every new UI string still goes into `en.json` only; translators never
  touch TypeScript, and a broken translation can only fall back to
  English, never break the UI.
- Chrome CSS has to be audited once for physical properties, and stays
  checked by lint afterwards.

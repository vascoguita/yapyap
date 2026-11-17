# Brand

YapYap has its own identity. It must never be confused with WhatsApp or Meta
products: no phone-in-a-bubble shapes and no WhatsApp green as a primary
color.

<img src="/logo.svg" alt="The YapYap icon: two overlapping speech bubbles, white and coral, on an indigo squircle" width="128" height="128" />

## Icon

Two overlapping rounded-rectangle speech bubbles, a white one in front and a
coral one behind, on an indigo-violet squircle: two voices, "yap yap". The
source is [`apps/desktop/build/icon.svg`](https://github.com/vascoguita/yapyap/blob/master/apps/desktop/build/icon.svg).
PNG exports from 16 to 1024 px are rasterized from it with Chromium and live
in `apps/desktop/build/icons/`.

- Keep the squircle background. Never place the bubbles alone on a busy
  background.
- Don't recolor, rotate, stretch, outline or add effects to the icon.
- Leave clear space of at least 1/8 of the icon size around it.
- Tray and menu-bar icons use a monochrome, symbolic version that follows the
  system theme.

## Palette

The brand's colors, as the icon and the website use them. The app's own
tokens follow under [In the app](#in-the-app).

| Token              | Light     | Dark      | Use                                       |
| ------------------ | --------- | --------- | ----------------------------------------- |
| `--yy-violet`      | `#5B47E0` | `#A99BFF` | The website's actions and focus, the icon |
| `--yy-violet-deep` | `#3F2FB8` | `#8F7DF7` | Pressed states, icon accents              |
| `--yy-coral`       | `#FF7A59` | `#FF8F73` | Highlights, unread badges                 |
| `--yy-ink`         | `#1E1B4B` | `#ECEAFF` | Primary text                              |
| `--yy-muted`       | `#5B5878` | `#A9A6C9` | Secondary text                            |
| `--yy-surface`     | `#FFFFFF` | `#14122B` | Window background                         |
| `--yy-surface-2`   | `#F4F3FF` | `#1E1B3D` | Sidebars, cards                           |

Measured contrast ratios (WCAG 2.2 AA requires 4.5:1 for text):

- white on `#5B47E0`: 6.1:1
- `#1E1B4B` on white: 16.0:1
- `#A99BFF` on `#14122B`: 7.7:1
- `#5B5878` on white: 6.8:1
- `#A9A6C9` on `#14122B`: 7.8:1
- `#1E1B4B` on coral `#FF7A59`: 6.2:1

Coral is for highlights and badges with dark text, never for body text on
white.

### In the app

YapYap's windows and its in-chat assistant draw from one set of tokens, on
`:root` in
[`renderer/styles.css`](https://github.com/vascoguita/yapyap/blob/master/apps/desktop/src/renderer/styles.css).
Their accent is the deep violet: white text on small controls needs more
contrast than `--yy-violet` gives at a glance. In dark mode it turns to a
light violet that reads on dark cards. The assistant takes the same accent
inside WhatsApp, over WhatsApp's own greys
([`assistant-look.ts`](https://github.com/vascoguita/yapyap/blob/master/apps/desktop/src/adapter/assistant-look.ts)).

| Token       | Light     | Dark      | Use                                                     |
| ----------- | --------- | --------- | ------------------------------------------------------- |
| `--accent`  | `#3F2FB8` | `#C9C3FF` | Primary buttons, switches, focus, links, chosen items   |
| `--text`    | `#1C1B29` | `#F2F1FA` | Text                                                    |
| `--muted`   | `#5B5A6E` | `#B0AEC4` | Hints, group titles                                     |
| `--surface` | `#FFFFFF` | `#17161F` | Window background                                       |
| `--card`    | `#F7F7FA` | `#1F1E29` | Cards of rows                                           |
| `--sidebar` | `#F3F2F8` | `#1B1A24` | The page list in Settings and Accounts, and the sidebar |
| `--border`  | `#DCD9F2` | `#34324A` | Card edges, dividers, controls                          |
| `--danger`  | `#B3261E` | `#FFB4AB` | What can do harm                                        |
| `--success` | `#1E7A46` | `#5BC688` | Ready, saved                                            |
| `--warning` | `#8A5A00` | `#E3B341` | Needs something                                         |

Measured contrast:

- white on `#3F2FB8`: 9.1:1; `#3F2FB8` on a card: 8.5:1
- `#C9C3FF` on a dark card: 10.0:1; the dark surface on `#C9C3FF`: 10.9:1
- `#5B5A6E` on a card: 6.3:1; `#B0AEC4` on a dark card: 7.6:1
- the assistant's accent on its tint: 7.9:1, and 8.7:1 in dark mode

Type, corners, spacing and motion are tokens too: `--font-title` (1.25rem),
`--font-body` (0.875rem), `--font-hint` (0.8125rem) and `--font-caption`
(0.75rem); `--radius-sm` (6 px, key caps), `--radius-md` (8 px, controls),
`--radius-lg` (10 px, cards) and `--radius-pill`; `--space-1` to `--space-8`
on a 4 px grid; `--shadow-raised` and `--motion`. A window uses them, never
values of its own.

Windows come in three sizes (`WINDOW_SIZES` in
`apps/desktop/src/main/chrome/window-sizes.ts`): a dialog, 440 px wide and as
tall as its content (About, New Chat, proxy sign-in); a medium window, 600 ×
640 px, which fits one column; and a large one, 820 × 640 px, for a page list
beside its content (Settings, Accounts, the share picker).

## Typography

- **App:** the platform's own UI font (`system-ui`, which is Segoe UI on
  Windows, SF Pro on macOS, and Cantarell or Noto Sans on Linux), so YapYap
  feels native everywhere. No web fonts are downloaded.
- **Wordmark and docs:** Inter, bundled with the documentation site.
  "YapYap" is written as one word with two capital Ys.

## Words

YapYap's text lives in
[`en.json`](https://github.com/vascoguita/yapyap/blob/master/apps/desktop/src/shared/messages/locales/en.json)
(ADR 0012). It follows the desktop platforms' own conventions:

- **Title Case** for buttons, menu items and window titles: **Add Account**,
  **Keep Editing**, **Choose What to Share**. Short words such as _a_,
  _and_, _in_ and _to_ stay lower case.
- **Sentence case** for everything else: headings, labels, options,
  tooltips, pills and messages.
- An ellipsis ends a button or menu item that asks for more before it acts:
  **Remove Account…**.
- No contractions: _cannot_, _does not_.
- A confirmation's button names its action (**Remove Account**, **Import
  Settings**), never _OK_ or _Yes_.
- A failure says what failed and what to do next: _Could not save the code.
  Try again._
- A place in Settings is written with an arrow, after its page's name:
  _Settings → AI Assistant_.
- One word for one thing: the _keychain_ keeps secrets, an _account_ is a
  WhatsApp login, a _token_ is what an AI agent holds.

## Disclaimer

YapYap is unofficial and is not affiliated with, endorsed by, or sponsored by
WhatsApp or Meta. "WhatsApp" is a trademark of its owner.

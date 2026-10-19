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

| Token              | Light     | Dark      | Use                           |
| ------------------ | --------- | --------- | ----------------------------- |
| `--yy-violet`      | `#5B47E0` | `#A99BFF` | Primary actions, focus, brand |
| `--yy-violet-deep` | `#3F2FB8` | `#8F7DF7` | Pressed states, icon accents  |
| `--yy-coral`       | `#FF7A59` | `#FF8F73` | Highlights, unread badges     |
| `--yy-ink`         | `#1E1B4B` | `#ECEAFF` | Primary text                  |
| `--yy-muted`       | `#5B5878` | `#A9A6C9` | Secondary text                |
| `--yy-surface`     | `#FFFFFF` | `#14122B` | Window background             |
| `--yy-surface-2`   | `#F4F3FF` | `#1E1B3D` | Sidebars, cards               |

Measured contrast ratios (WCAG 2.2 AA requires 4.5:1 for text):

- white on `#5B47E0`: 6.1:1
- `#1E1B4B` on white: 16.0:1
- `#A99BFF` on `#14122B`: 7.7:1
- `#5B5878` on white: 6.8:1
- `#A9A6C9` on `#14122B`: 7.8:1
- `#1E1B4B` on coral `#FF7A59`: 6.2:1

Coral is for highlights and badges with dark text, never for body text on
white.

## Typography

- **App:** the platform's own UI font (`system-ui`, which is Segoe UI on
  Windows, SF Pro on macOS, and Cantarell or Noto Sans on Linux), so YapYap
  feels native everywhere. No web fonts are downloaded.
- **Wordmark and docs:** Inter, bundled with the documentation site.
  "YapYap" is written as one word with two capital Ys.

## Disclaimer

YapYap is unofficial and is not affiliated with, endorsed by, or sponsored by
WhatsApp or Meta. "WhatsApp" is a trademark of its owner.

import type { JSX } from 'preact';

/** Outline icons drawn for YapYap; each is a 20 px square in the text's color. */
const PATHS = {
  general: 'M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM3.5 7.5h13',
  appearance: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 3v14',
  notifications: 'M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13zM8.25 17.25a1.9 1.9 0 0 0 3.5 0',
  downloads: 'M10 3.5v9.5M6 9.5l4 4 4-4M4 16.5h12',
  /** A tick under a letter: words checked as they are typed. */
  spelling: 'M4 11.5l3-8 3 8M5.1 8.5h3.8M11 13.5l2.2 2.2 3.8-4.2',
  shortcuts: 'M3 5.5h14v9H3zM6 8.5h1M9.5 8.5h1M13 8.5h1M7 11.5h6',
  assistant:
    'M9 3.5l1.3 3.7a2 2 0 0 0 1.2 1.2L15.2 9.7l-3.7 1.3a2 2 0 0 0-1.2 1.2L9 15.9l-1.3-3.7a2 2 0 0 0-1.2-1.2L2.8 9.7l3.7-1.3a2 2 0 0 0 1.2-1.2zM15.5 13.5v3M14 15h3',
  agents:
    'M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM6.5 8l2 2-2 2M10.5 12.5h3',
  network:
    'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM3 10h14M10 3c2 2 2.8 4.5 2.8 7S12 15 10 17c-2-2-2.8-4.5-2.8-7S8 5 10 3z',
  advanced:
    'M3.5 6.5h13M3.5 13.5h13M12.5 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.5 11.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  /** Angle brackets around a slash: the user's own CSS and JavaScript. */
  code: 'M7 6.5L3.5 10 7 13.5M13 6.5l3.5 3.5-3.5 3.5M11.25 4.5l-2.5 11',
  backup: 'M3 4.5h14v3H3zM4.5 7.5v8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-8M8 10.5h4',
  restart: 'M15.5 10a5.5 5.5 0 1 1-1.6-3.9M15.5 3.5v3h-3',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  alert: 'M10 4.5v7M10 14.5v1',
  circle: 'M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  info: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 9v4.5M10 6.5v.5',
  lock: 'M5.5 9.5h9v7h-9zM7.5 9.5V7a2.5 2.5 0 0 1 5 0v2.5',
  plus: 'M10 4.5v11M4.5 10h11',
  minus: 'M4.5 10h11',
  /** A bell struck through: an account that stays silent. */
  muted: 'M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13zM8.25 17.25a1.9 1.9 0 0 0 3.5 0M3.5 3.5l13 13',
  /** A crescent moon: Do Not Disturb, for every account at once. */
  moon: 'M16 12.2A6.5 6.5 0 0 1 7.8 4 6.5 6.5 0 1 0 16 12.2z',
  collapse: 'M12 5l-5 5 5 5',
  expand: 'M8 5l5 5-5 5',
  remove: 'M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6',
} as const;

export type IconName = keyof typeof PATHS;

/** A decorative icon: what it stands for is always also written beside it. */
export function Icon({ name }: { readonly name: IconName }): JSX.Element {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

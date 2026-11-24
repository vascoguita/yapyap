/**
 * A button on the notice above the message box: Undo puts back the draft
 * a rewrite replaced, fix mends the setup in one click, close takes the
 * notice away.
 */
export type BarButtonId = 'undo' | 'fix' | 'retry' | 'close';

export const BAR_BUTTON_IDS: readonly BarButtonId[] = ['undo', 'fix', 'retry', 'close'];

/** A short line above the message box, with the one button that goes with it. */
interface BarNotice {
  readonly text: string;
  /** Undo or a fix, labelled in the user's words; null for a notice with only close. */
  readonly button: { readonly id: Exclude<BarButtonId, 'close'>; readonly label: string } | null;
}

/**
 * The summary of the messages the open chat opened with unread (#705):
 * being written, shown, or why none came. It is held only in memory.
 */
export interface BarSummary {
  readonly stage: 'working' | 'shown' | 'failed';
  /** How many messages were unread, as the chat list's badge counted them. */
  readonly count: number;
  /** Its points, what concerns the user first, as plain text, never markup; empty until it shows. */
  readonly points: readonly string[];
  /** How many of the newest messages it covers when the history limit read fewer than `count`; else 0. */
  readonly covered: number;
  /** Why no summary came, and whether Try Again may bring one; null unless it failed. */
  readonly problem: { readonly text: string; readonly retry: boolean } | null;
}

/** What the assistant shows in and above the open chat's message box (ADR 0013, ADR 0017). */
export interface AssistantBarState {
  /** Waiting for the model to rewrite the draft. */
  readonly working: boolean;
  /** Reply suggestions, as plain text, never markup; empty for none. */
  readonly suggestions: readonly string[];
  /** What a rewrite did, or what keeps the assistant from answering; null for none. */
  readonly notice: BarNotice | null;
  /** The way the message box's rewrite button rewrites, the last one the user picked. */
  readonly polish: string;
  /** The model in use, by name, for the rewrite menu's settings item. */
  readonly model: string;
  /**
   * The chat the bar follows, by the fingerprint the look at the page gave
   * its header (`fingerprint` in the adapter), so the page shows the
   * suggestions and notice only while that chat is open (#730, #741); null
   * while no chat is open.
   */
  readonly chat: string | null;
  /** The user folded the suggestions away; they show again only when the user asks (#729). */
  readonly collapsed: boolean;
  /** The model is writing suggestions, which take seconds (#703). */
  readonly writing: boolean;
  /** The summary of the unread messages, being written, shown or failed; null for none (#705). */
  readonly summary: BarSummary | null;
}

/**
 * The global the WhatsApp preload exposes in the adapter's isolated world,
 * never in WhatsApp's own, for the assistant's controls (ADR 0013).
 */
export const ASSISTANT_BAR_BRIDGE = 'yapyapAssistantBar';

/** Fixed channels, one per user action, from WhatsApp's page to the main process. */
export const ASSISTANT_BAR_CHANNELS = {
  polish: 'whatsapp:assistant-bar-polish',
  use: 'whatsapp:assistant-bar-use',
  collapse: 'whatsapp:assistant-bar-collapse',
  expand: 'whatsapp:assistant-bar-expand',
  button: 'whatsapp:assistant-bar-button',
  settings: 'whatsapp:assistant-bar-settings',
  summarize: 'whatsapp:assistant-bar-summarize',
  closeSummary: 'whatsapp:assistant-bar-close-summary',
} as const;

/**
 * What the assistant's controls call. The main process checks every
 * argument, since anything in the adapter's world could call these.
 */
export interface AssistantBarBridge {
  /** Rewrites the draft in place in one of the rewrite button's ways. */
  readonly polish: (value: string) => void;
  /** Puts the suggestion in the message box; it never sends it. */
  readonly use: (index: number) => void;
  /** Folds the suggestions away, until the user shows them again (#729). */
  readonly collapse: () => void;
  /** Shows the suggestions again, as they were. */
  readonly expand: () => void;
  /** Presses the notice's button. */
  readonly button: (id: string) => void;
  /** Opens Settings, at the assistant. */
  readonly settings: () => void;
  /** Writes the summary again, after one that failed (#705). */
  readonly summarize: () => void;
  /** Closes the summary. */
  readonly closeSummary: () => void;
}

/**
 * A button on the notice above the message box: Undo puts back the draft
 * a rewrite replaced, fix mends the setup in one click, close takes the
 * notice away.
 */
export type BarButtonId = 'undo' | 'fix' | 'close';

export const BAR_BUTTON_IDS: readonly BarButtonId[] = ['undo', 'fix', 'close'];

/** A short line above the message box, with the one button that goes with it. */
interface BarNotice {
  readonly text: string;
  /** Undo or a fix, labelled in the user's words; null for a notice with only close. */
  readonly button: { readonly id: Exclude<BarButtonId, 'close'>; readonly label: string } | null;
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
  dismiss: 'whatsapp:assistant-bar-dismiss',
  button: 'whatsapp:assistant-bar-button',
  settings: 'whatsapp:assistant-bar-settings',
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
  /** Hides the suggestions until the next message arrives. */
  readonly dismiss: () => void;
  /** Presses the notice's button. */
  readonly button: (id: string) => void;
  /** Opens Settings, at the assistant. */
  readonly settings: () => void;
}

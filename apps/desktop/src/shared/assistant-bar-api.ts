/** What the assistant bar above the message box shows (ADR 0013). */
export interface AssistantBarState {
  /** The name of the extension whose suggestions these are. */
  readonly extension: string;
  /** A short line from YapYap or the extension, such as "Thinking…"; empty for none. */
  readonly status: string;
  /** Plain text, never markup. */
  readonly suggestions: readonly string[];
  /** The label of a button that answers the extension's question, if it asked one. */
  readonly confirm: string | undefined;
  /** Waiting for the extension. */
  readonly working: boolean;
}

/**
 * The global the WhatsApp preload exposes in the adapter's isolated world,
 * never in WhatsApp's own, for the bar's buttons (ADR 0013).
 */
export const ASSISTANT_BAR_BRIDGE = 'yapyapAssistantBar';

/** Fixed channels, one per user action, from the bar in WhatsApp's page to the main process. */
export const ASSISTANT_BAR_CHANNELS = {
  suggest: 'whatsapp:assistant-bar-suggest',
  prompt: 'whatsapp:assistant-bar-prompt',
  confirm: 'whatsapp:assistant-bar-confirm',
  use: 'whatsapp:assistant-bar-use',
  send: 'whatsapp:assistant-bar-send',
} as const;

/**
 * What the bar's buttons call. The main process checks every argument, since
 * anything in the adapter's world could call these.
 */
export interface AssistantBarBridge {
  readonly suggest: () => void;
  readonly prompt: (text: string) => void;
  readonly confirm: () => void;
  /** Puts the suggestion in the message box. */
  readonly use: (index: number) => void;
  /** Puts the suggestion in the message box and sends it, on this click only. */
  readonly send: (index: number) => void;
}

/** A choice the bar shows, such as the model in use (#467): what the user sees of it. */
interface BarChoice {
  readonly label: string;
  readonly current: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

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
  /** The extension's choice, such as its model, or undefined for none. */
  readonly choice: BarChoice | undefined;
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
  choose: 'whatsapp:assistant-bar-choose',
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
  /** Picks an option of the extension's choice, such as another model. */
  readonly choose: (value: string) => void;
}

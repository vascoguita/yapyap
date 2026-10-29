import type { CallRecording } from '@yapyap/extension-sdk';
import { status, type Request, type Status } from './bus.ts';

/** The channel to the hidden page, as the panel uses it. */
export interface PanelPort {
  readonly postMessage: (message: Request) => void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/** How often the panel asks again, so a call or recording started elsewhere shows up. */
export const REFRESH_MS = 2000;

const CONSENT =
  'In many places it is against the law to record a call without everyone’s consent. ' +
  'Ask everyone on the call before you record it.';

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  return Object.assign(doc.createElement(tag), props);
}

/** Minutes and seconds, or hours too for a long call. */
export function length(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return minutes < 60
    ? `${String(minutes)}:${rest}`
    : `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}

function said(news: Status): string {
  if (!news.supported) {
    return 'YapYap cannot record calls on this system yet.';
  }
  if (news.recordingSince !== null) {
    return `Recording since ${new Date(news.recordingSince).toLocaleTimeString()}.`;
  }
  return news.call ? 'A call is running.' : 'No call is running.';
}

function recordingItem(doc: Document, port: PanelPort, recording: CallRecording): HTMLLIElement {
  const reveal = element(doc, 'button', { type: 'button', textContent: 'Show in folder' });
  reveal.addEventListener('click', () => {
    port.postMessage({ type: 'reveal', id: recording.id });
  });
  const when = `${new Date(recording.started).toLocaleString()}, ${length(recording.durationMs)}`;
  const item = element(doc, 'li');
  item.append(element(doc, 'span', { textContent: when }), reveal);
  return item;
}

/** A button that sends `asked` to the hidden page; disabled until the status allows it. */
function asking(doc: Document, port: PanelPort, label: string, asked: Request): HTMLButtonElement {
  const button = element(doc, 'button', { type: 'button', textContent: label, disabled: true });
  button.addEventListener('click', () => {
    port.postMessage(asked);
  });
  return button;
}

/**
 * The panel: what the call and recording are doing, Record and Stop, and the
 * recordings so far. It only asks; YapYap asks the user before recording.
 */
export function mountPanel(
  doc: Document,
  port: PanelPort,
  every: (run: () => void, ms: number) => unknown = setInterval,
): void {
  const line = element(doc, 'output');
  const record = asking(doc, port, 'Record', { type: 'record' });
  const stop = asking(doc, port, 'Stop', { type: 'stop' });
  const list = element(doc, 'ul');
  port.onmessage = ({ data }) => {
    const news = status(data);
    if (news === undefined) {
      return;
    }
    line.textContent = said(news);
    record.disabled = !news.supported || !news.call || news.recordingSince !== null;
    stop.disabled = news.recordingSince === null;
    list.replaceChildren(
      ...(news.recordings.length === 0
        ? [element(doc, 'li', { textContent: 'No recordings yet.' })]
        : news.recordings.map((recording) => recordingItem(doc, port, recording))),
    );
  };
  doc.body.append(
    element(doc, 'h1', { textContent: 'Call recorder' }),
    element(doc, 'p', { textContent: CONSENT }),
    line,
    record,
    stop,
    element(doc, 'h2', { textContent: 'Recordings' }),
    list,
  );
  const ask = (): void => {
    port.postMessage({ type: 'status?' });
  };
  ask();
  every(ask, REFRESH_MS);
}

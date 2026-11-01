import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import type { TextFile } from '../atomic-write.ts';

const FORMAT_VERSION = 1;

const PrivateModelRecord = Type.Object(
  {
    /** The catalog's ID of the model the user chose. */
    id: Type.String({ minLength: 1, maxLength: 100 }),
    /** The whole file is downloaded and matched its SHA-256. */
    ready: Type.Boolean(),
  },
  { additionalProperties: false },
);

/** The private model the user chose, and whether it is all there. */
export type PrivateModelRecord = Static<typeof PrivateModelRecord>;

/**
 * A one-time note the bar shows: the assistant became part of YapYap, and
 * the private model, which the extension kept in its own storage, must be
 * downloaded again (ADR 0017).
 */
export type AssistantNotice = 'moved' | 'moved-redownload';

const StateSchema = Type.Object(
  {
    version: Type.Literal(FORMAT_VERSION),
    privateModel: Type.Union([PrivateModelRecord, Type.Null()]),
    notice: Type.Union([Type.Literal('moved'), Type.Literal('moved-redownload'), Type.Null()]),
  },
  { additionalProperties: false },
);

type Saved = Static<typeof StateSchema>;

/** What the assistant keeps that is no preference, in `assistant.json`. */
export interface AssistantState {
  readonly privateModel: () => PrivateModelRecord | undefined;
  readonly setPrivateModel: (record: PrivateModelRecord | undefined) => void;
  readonly notice: () => AssistantNotice | undefined;
  readonly setNotice: (notice: AssistantNotice | undefined) => void;
}

const EMPTY: Saved = { version: FORMAT_VERSION, privateModel: null, notice: null };

function readState(file: TextFile): Saved {
  try {
    const value: unknown = JSON.parse(file.read());
    return Value.Check(StateSchema, value) ? value : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * The assistant's state, read once and written whenever it changes. Like
 * the window's size, it is state, not a preference, so it stays out of
 * settings and their export. A write that fails keeps it for this run.
 */
export function assistantState(file: TextFile, warn: (message: string) => void): AssistantState {
  let state = readState(file);
  const change = (next: Partial<Saved>): void => {
    state = { ...state, ...next };
    try {
      file.write(`${JSON.stringify(state)}\n`);
    } catch {
      warn('Could not save the assistant’s state.');
    }
  };
  return {
    privateModel: () => state.privateModel ?? undefined,
    setPrivateModel: (record) => {
      change({ privateModel: record ?? null });
    },
    notice: () => state.notice ?? undefined,
    setNotice: (notice) => {
      change({ notice: notice ?? null });
    },
  };
}

import { vi, type Mock } from 'vitest';
import type { ModelOption } from '../models.ts';

/** What a provider lists in tests: Claude's models, newest first, as Anthropic lists them. */
export const LISTED: readonly ModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
];

/** A provider's list that answers at once, without the network. */
export const listing = (
  models: readonly ModelOption[] = LISTED,
): Mock<(...args: unknown[]) => Promise<ModelOption[]>> =>
  vi.fn(() => Promise.resolve([...models]));

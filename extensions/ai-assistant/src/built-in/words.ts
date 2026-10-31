import { aboutSize, inMegabytes, type BuiltInModel } from './catalog.ts';
import type { LocalState, Phase } from './local-model.ts';

/** What the user can do next with the private model: download or resume it, or try the smaller one. */
export type LocalAction = 'download' | 'smaller';

/** What the bar and the panel say about the private model, and the button that goes with it. */
export interface LocalWords {
  readonly status: string;
  /** The button's label, '' for none. */
  readonly label: string;
  readonly action: LocalAction | '';
}

const words = (status: string, label = '', action: LocalAction | '' = ''): LocalWords => ({
  status,
  label,
  action,
});

const RESUME = 'Resume';

/** The offer of a private model, to someone who has no other (#457). */
export const offerOf = (model: BuiltInModel): LocalWords =>
  words(
    `Use a private model on this computer (${aboutSize(model.size)}, downloaded once)? Your messages never leave it.`,
    'Use a private model',
    'download',
  );

/** How far the download is: "40% (450 of 1,117 MB)". */
function howFar(done: number, model: BuiltInModel): string {
  const percent = Math.floor((done / model.size) * 100);
  return `${String(percent)}% (${inMegabytes(done)} of ${inMegabytes(model.size)} MB)`;
}

function paused(phase: Extract<Phase, { kind: 'paused' }>, model: BuiltInModel): LocalWords {
  const far = howFar(phase.done, model);
  if (phase.problem === 'disk-full') {
    const needed = aboutSize(model.size - phase.done);
    return words(
      `Not enough disk space for the private model: free up ${needed}, then resume.`,
      RESUME,
      'download',
    );
  }
  const lead =
    phase.problem === 'download-failed'
      ? 'The download stopped. Check your connection, then resume'
      : 'The private model’s download is paused';
  return words(`${lead}: ${far}.`, RESUME, 'download');
}

/** What to say in each phase, given the phase, the model's state, and whether to offer it. */
const SAYINGS: {
  readonly [K in Phase['kind']]: (
    phase: Extract<Phase, { kind: K }>,
    state: LocalState,
    offered: boolean,
  ) => LocalWords;
} = {
  none: (_phase, { model }, offered) => (offered ? offerOf(model) : words('')),
  downloading: ({ done }, { model }) =>
    words(`Downloading the private model: ${howFar(done, model)}`),
  paused: (phase, { model }) => paused(phase, model),
  damaged: () =>
    words(
      'The downloaded model was damaged, so it was deleted. Download it again?',
      'Download again',
      'download',
    ),
  ready: () => words('The private model is ready. Your messages stay on this computer.'),
  warming: () => words('Warming up the model…'),
  'out-of-memory': (_phase, { smaller }) =>
    smaller
      ? words(
          'This computer doesn’t have enough memory for this model. Try the smaller one?',
          'Try the smaller one',
          'smaller',
        )
      : words(
          'This computer doesn’t have enough memory for the private model. Close other apps, then try again.',
        ),
};

/**
 * What the bar and the panel say about the private model, in plain words
 * and without its name; `offered` says whether to offer it at all when
 * there is none yet.
 */
export function wordsFor(state: LocalState, offered: boolean): LocalWords {
  const say = SAYINGS[state.phase.kind] as (
    phase: Phase,
    state: LocalState,
    offered: boolean,
  ) => LocalWords;
  return say(state.phase, state, offered);
}

/** @vitest-environment happy-dom */
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from './page-state.ts';
import { clickTarget, clickTargetProbe, parseClickTarget } from './click-target.ts';

const PLACES = {
  composer: LANDMARKS.composer,
  conversation: LANDMARKS.conversation,
  chatList: LANDMARKS.chatList,
};

const PAGE = `
<div id="app"><div id="pane-side"><div role="row" id="chat">Chat</div></div></div>
<div id="main">
  <div role="row" id="message">Message</div>
  <footer><div contenteditable="true"><p id="draft">Draft</p></div></footer>
</div>
<div id="elsewhere">Elsewhere</div>`;

/** A document whose point lookup finds the element with `id`. */
const pointingAt = (id: string | null) => ({
  elementFromPoint: () => (id === null ? null : document.getElementById(id)),
});

describe('clickTarget', () => {
  it('names the landmark under the point', () => {
    document.body.innerHTML = PAGE;
    expect(clickTarget(pointingAt('draft'), 1, 1, PLACES)).toBe('composer');
    expect(clickTarget(pointingAt('message'), 1, 1, PLACES)).toBe('message');
    expect(clickTarget(pointingAt('chat'), 1, 1, PLACES)).toBe('chat');
    expect(clickTarget(pointingAt('elsewhere'), 1, 1, PLACES)).toBe('other');
    expect(clickTarget(pointingAt(null), 1, 1, PLACES)).toBe('other');
    expect(clickTarget({ elementFromPoint: () => ({}) }, 1, 1, PLACES)).toBe('other');
  });
});

describe('parseClickTarget', () => {
  it('takes only a known answer', () => {
    expect(['composer', 'message', 'chat', 'other'].map(parseClickTarget)).toEqual([
      'composer',
      'message',
      'chat',
      'other',
    ]);
    expect([undefined, 'main', 3].map(parseClickTarget)).toEqual(['other', 'other', 'other']);
  });
});

describe('clickTargetProbe', () => {
  // Stryker's instrumented source refers to its own helpers, so it cannot run on its own.
  it.skipIf(clickTargetProbe(0, 0).includes('stryMutAct'))(
    'runs on its own, at the point it was given',
    () => {
      document.body.innerHTML = PAGE;
      const asked: number[][] = [];
      const doc = {
        elementFromPoint: (x: number, y: number) => {
          asked.push([x, y]);
          return document.getElementById('chat');
        },
      };
      expect(runInNewContext(clickTargetProbe(12.5, 40), { document: doc })).toBe('chat');
      runInNewContext(clickTargetProbe(Number.NaN, Infinity), { document: doc });
      expect(asked).toEqual([
        [12.5, 40],
        [-1, -1],
      ]);
    },
  );
});

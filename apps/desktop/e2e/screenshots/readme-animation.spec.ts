import type { ElectronApplication, Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ADAPTER_WORLD_ID } from '../../src/adapter/world.ts';
import { allowAllChats, claudeAnswer, readyClaude } from '../assistant-helpers.ts';
import { startFakeWhatsApp } from '../fake-whatsapp-server.ts';
import { closeApp, expect, launchApp, test } from '../fixtures.ts';
import { MAIN, PERSONAL, personalPage, preparePersonas, SCALE, seed } from './showcase.ts';

/**
 * The README's animation (#663): suggested replies, one picked and sent, a
 * new message, then a draft of one's own made fuller by the AI Assistant and
 * sent. It is recorded on the showcase page with invented people, and Claude
 * is played by the test, so nothing reaches a real account or the real API.
 * The file is hosted in GitHub's attachments rather than git; see CONTRIBUTING.
 */
const OUT = join(import.meta.dirname, '..', '..', 'test-results', 'readme');

const FIRST_REPLIES = 'Amazing, thanks Inês! 🙌\nSee you at 10!\nI’ll bring snacks';
const PRIYA = 'Dinner after the tour? Anyone know a good place nearby?';
const SECOND_REPLIES = 'Yes, I’m in! 🍷\nLet’s try Alfama\nI can book a table';
const DRAFT = 'i know a fado place in alfama, i can book for 8 if everyone is in';
const ELABORATED =
  'I know a lovely fado place in Alfama with great food. I can book a table for 8 if everyone’s in. Shall I go ahead?';

interface Spot {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/** Runs in the adapter's isolated world: where the bar's and the rewrite button's controls are. */
function readControls(): Spot[] {
  interface Kept {
    readonly host: HTMLElement;
    readonly parts: Readonly<Record<string, HTMLElement>>;
  }
  const views = globalThis as { yapyapAssistantBarView?: Kept; yapyapComposerToolView?: Kept };
  const roots = [views.yapyapAssistantBarView, views.yapyapComposerToolView]
    .filter((kept) => kept?.host.isConnected === true)
    .map((kept) => (kept?.parts['bar'] ?? kept?.parts['tool'])?.getRootNode() as ParentNode);
  return roots.flatMap((root) =>
    [...root.querySelectorAll('button')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const box = button.getBoundingClientRect();
        const name =
          button.getAttribute('aria-label') ??
          button.querySelector('.name')?.textContent ??
          button.textContent;
        return { name: name.trim(), x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }),
  );
}

/** Where a control named `name` is, once it shows, in the Personal account's page. */
async function find(app: ElectronApplication, name: string): Promise<Spot> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const spots = (await app.evaluate(
      async ({ webContents }, { id, code, world }) =>
        webContents
          .getAllWebContents()
          .find((page) => page.session.storagePath?.endsWith(`account-${id}`) === true)
          ?.executeJavaScriptInIsolatedWorld(world, [{ code }]) as Promise<unknown> | undefined,
      { id: PERSONAL, code: `(${readControls.toString()})()`, world: ADAPTER_WORLD_ID },
    )) as Spot[] | undefined;
    const spot = spots?.find((each) => each.name === name);
    if (spot !== undefined) {
      return spot;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`No ${name} showed.`);
}

/** Answers by what was asked: the draft is rewritten, the newest message gets its own replies. */
async function playClaude(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    ({ session }, answers) => {
      const protocol = session.fromPartition('yapyap-assistant').protocol;
      protocol.unhandle('https');
      protocol.handle('https', async (request) => {
        const asked = await request.text();
        const priya = asked.includes(answers.priya) ? answers.second : answers.first;
        const answer = asked.includes(answers.draft) ? answers.elaborated : priya;
        return new Response(answer, { headers: { 'content-type': 'text/event-stream' } });
      });
    },
    {
      first: claudeAnswer(FIRST_REPLIES),
      second: claudeAnswer(SECOND_REPLIES),
      elaborated: claudeAnswer(ELABORATED),
      draft: DRAFT.slice(0, 24),
      priya: PRIYA.slice(0, 20),
    },
  );
}

/** A drawn pointer and click ring: the virtual display does not record the real pointer. */
async function addPointer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pointer = document.createElement('div');
    pointer.id = 'demo-pointer';
    pointer.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    pointer.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(900px,520px);transition:transform 600ms cubic-bezier(.4,.1,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))';
    const ring = document.createElement('div');
    ring.id = 'demo-ring';
    ring.style.cssText =
      'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(124,108,255,.9);z-index:2147483646;pointer-events:none;opacity:0';
    document.body.append(ring, pointer);
  });
}

async function glide(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const pointer = document.getElementById('demo-pointer');
      if (pointer !== null) {
        pointer.style.transform = `translate(${String(x - 5)}px, ${String(y - 3)}px)`;
      }
    },
    { x, y },
  );
  await page.waitForTimeout(650);
}

async function click(page: Page, x: number, y: number): Promise<void> {
  await glide(page, x, y);
  await page.waitForTimeout(200);
  await page.evaluate(
    ({ x, y }) => {
      const ring = document.getElementById('demo-ring');
      if (ring !== null) {
        ring.style.left = `${String(x)}px`;
        ring.style.top = `${String(y)}px`;
        ring.animate(
          [
            { opacity: 1, transform: 'scale(.4)' },
            { opacity: 0, transform: 'scale(1.3)' },
          ],
          { duration: 450, easing: 'ease-out' },
        );
      }
    },
    { x, y },
  );
  await page.mouse.click(x, y);
}

/** The middle of an element's box, where the user would click it. */
function middle(box: { x: number; y: number; width: number; height: number } | null): {
  x: number;
  y: number;
} {
  return box === null ? { x: 0, y: 0 } : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Clicks Send, then moves the pointer out of the way while the message lands. */
async function send(page: Page): Promise<void> {
  const at = middle(await page.locator('#voice-or-send').boundingBox());
  await click(page, at.x, at.y);
  await glide(page, at.x - 380, at.y - 260);
}

/** Records the screen where the main window sits, until `stop`. */
function record(file: string): () => Promise<void> {
  const ffmpeg = spawn('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '25'],
    ...['-video_size', `${String(MAIN.width * SCALE)}x${String(MAIN.height * SCALE)}`],
    ...['-i', `${String(process.env['DISPLAY'])}+0,0`],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', file],
  ]);
  return () =>
    new Promise((done) => {
      ffmpeg.once('exit', done);
      ffmpeg.kill('SIGINT');
    });
}

/** The story, at a pace someone new to YapYap can follow. */
async function tellStory(app: ElectronApplication, page: Page): Promise<void> {
  // 1. Suggestions arrive for Inês's message once the window is seen.
  await app.evaluate(({ BaseWindow }) => {
    BaseWindow.getAllWindows()
      .find((window) => window.getContentView().children.length > 0)
      ?.focus();
  });
  const pick = await find(app, 'See you at 10!');
  await page.waitForTimeout(1500);
  // 2. One is picked and sent.
  await click(page, pick.x, pick.y);
  await page.waitForTimeout(800);
  await send(page);
  await page.waitForTimeout(500);
  // 3. Priya writes, and new suggestions come.
  await page.evaluate((text) => {
    (window as unknown as { showcaseReceive: (who: string, text: string) => void }).showcaseReceive(
      'Priya',
      text,
    );
  }, PRIYA);
  await find(app, 'Let’s try Alfama');
  await page.waitForTimeout(1500);
  // 4. A draft of one's own instead, made fuller by the AI Assistant, then sent.
  const field = middle(await page.getByTestId('composer').boundingBox());
  await click(page, field.x - 200, field.y);
  await page.keyboard.type(DRAFT, { delay: 32 });
  await page.waitForTimeout(500);
  const arrow = await find(app, 'Choose how to rewrite');
  await click(page, arrow.x, arrow.y);
  await page.waitForTimeout(500);
  const shorten = await find(app, 'Shorten');
  await glide(page, shorten.x, shorten.y);
  const elaborate = await find(app, 'Elaborate');
  await glide(page, elaborate.x, elaborate.y);
  await click(page, elaborate.x, elaborate.y);
  await page.waitForTimeout(1900);
  await send(page);
  await page.waitForTimeout(1600);
}

test('README animation', async ({ profile }) => {
  test.setTimeout(180_000);
  const showcase = await startFakeWhatsApp('showcase.html');
  await seed(profile, 'light');
  await preparePersonas(showcase.origin, profile);
  const app = await launchApp(showcase.origin, profile, [
    `--force-device-scale-factor=${String(SCALE)}`,
  ]);
  await mkdir(OUT, { recursive: true });
  const raw = join(OUT, 'raw.mkv');
  try {
    const settings = await readyClaude(app, claudeAnswer(FIRST_REPLIES));
    await allowAllChats(settings);
    await playClaude(app);
    const page = await personalPage(app);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await addPointer(page);
    await page.waitForTimeout(600);
    const stop = record(raw);
    await tellStory(app, page);
    await stop();
  } finally {
    await closeApp(app);
    await showcase.close();
  }
  // Lossy animated WebP at 1440 px: the unchanged frames merge, so it stays small.
  execFileSync('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-ss', '0.5', '-i', raw],
    ...['-vf', `fps=20,scale=${String(MAIN.width)}:-1:flags=lanczos`],
    ...['-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '75'],
    ...['-compression_level', '6', '-loop', '0', '-an', join(OUT, 'yapyap-ai-assistant.webp')],
  ]);
  // Small enough for the README to load at once.
  expect((await stat(join(OUT, 'yapyap-ai-assistant.webp'))).size).toBeLessThan(1_000_000);
});

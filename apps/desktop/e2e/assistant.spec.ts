import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  allowAllChats,
  barNames,
  barNotice,
  CLAUDE_ANSWER,
  claudeAnswer,
  claudeRequests,
  clickInBar,
  clickInTool,
  fakeModelServer,
  focusMain,
  messageArrives,
  openAssistantSettings,
  quietPort,
  readyClaude,
  standInKeyring,
  toolNames,
} from './assistant-helpers.ts';
import { chromePage } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

test('sets Claude up in Settings › Assistant, with the key encrypted, tested and in use', async ({
  app,
  profile,
}) => {
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  // The assistant comes first in Settings.
  const first = settings.locator('main section').first();
  await expect(first).toHaveAttribute('aria-labelledby', 'assistant-title');
  await expect(settings.getByText('In use')).toBeVisible();
  await expect(settings.getByLabel('API key for Claude (Anthropic)')).toHaveValue('');
  const kept = await readFile(join(profile, 'secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-ant-e2e-key');
  await settings.getByRole('button', { name: 'Test' }).click();
  await expect(settings.getByText('The key works.')).toBeVisible();
  // Auto picks the newest of Claude's quick models from what the provider lists.
  await expect(
    settings.getByRole('option', { name: 'Auto (recommended): Claude Haiku 5.5' }),
  ).toBeAttached();
  await settings.getByRole('button', { name: 'Forget Key' }).click();
  await expect(settings.getByText('No key saved.').first()).toBeVisible();
});

test('suggests replies when a message arrives, only in a chat the user added in Settings', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await (await readyClaude(app, CLAUDE_ANSWER)).close();
  await focusMain(app);
  // The chat is not listed yet, so nothing of it is read.
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await window.waitForTimeout(3000);
  expect(await claudeRequests(app)).toEqual([]);
  expect(await barNames(app)).toEqual([]);
  const settings = await openAssistantSettings(app);
  await settings.getByRole('button', { name: 'Add the Chat Open in WhatsApp' }).click();
  await expect(settings.getByText(/: Test Chat One$/)).toBeVisible();
  await settings.close();
  await focusMain(app);
  await messageArrives(window, '3EB0F8', 'Dinner at 8 still?');
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass({ timeout: 15_000 });
  const asked = await claudeRequests(app);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('Them: Dinner at 8 still?');
  expect(asked[0]).toContain('"model":"claude-haiku-5-5"');
  // WhatsApp's page cannot read the suggestions.
  expect(await window.evaluate(() => document.body.innerText)).not.toContain('Can we do 9?');
  // A suggestion fills the message box, and never sends.
  await clickInBar(app, window, 'Can we do 9?');
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  await expect(async () => {
    expect(await barNames(app)).not.toContain('Yes, 8 works!');
  }).toPass();
  await expect(window.getByTestId('sent')).toHaveCount(0);
});

test('hides suggestions while the user types, and after Dismiss until the next message', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, claudeAnswer('Still on!'));
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('Sure');
  await expect(async () => {
    expect(await barNames(app)).toEqual([]);
  }).toPass();
  for (let index = 0; index < 4; index += 1) {
    await window.keyboard.press('Backspace');
  }
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass();
  await clickInBar(app, window, 'Dismiss suggestions');
  await expect(async () => {
    expect(await barNames(app)).toEqual([]);
  }).toPass();
  await messageArrives(window, '3EB0F8', 'Hello?');
  await expect(async () => {
    expect(await barNames(app)).toContain('Still on!');
  }).toPass({ timeout: 15_000 });
  expect(await claudeRequests(app)).toHaveLength(2);
});

test('rewrites the draft in place from the message box, puts it back on Undo, and never sends', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(
    app,
    claudeAnswer('“I am running a little late, sorry!”'),
    claudeAnswer('So sorry, I am running a bit late!'),
  );
  await allowAllChats(settings);
  await focusMain(app);
  // With nothing typed, the message box shows no assistant.
  await expect(async () => {
    expect(await toolNames(app)).toEqual([]);
  }).toPass();
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('running late');
  await clickInTool(app, window, 'Polish');
  await expect(composer).toHaveText('I am running a little late, sorry!');
  await expect(async () => {
    expect(await barNotice(app)).toBe('Polished. Edit it or send as is.');
  }).toPass();
  const asked = await claudeRequests(app);
  expect(asked[0]).toContain('spelling, grammar and flow');
  expect(asked[0]).toContain('running late');
  await clickInBar(app, window, 'Undo');
  await expect(composer).toHaveText('running late');
  await expect(async () => {
    expect(await barNotice(app)).toBeNull();
  }).toPass();
  // The menu has five ways and the settings, and the way picked rewrites at once.
  await clickInTool(app, window, 'Choose how to rewrite');
  await expect(async () => {
    expect(await toolNames(app)).toEqual([
      'Polish',
      'Choose how to rewrite',
      'Polish',
      'Shorten',
      'Elaborate',
      'Soften',
      'Formalize',
      'Assistant settings',
    ]);
  }).toPass();
  await clickInTool(app, window, 'Soften');
  await expect(composer).toHaveText('So sorry, I am running a bit late!');
  expect((await claudeRequests(app))[1]).toContain('gentler and friendlier');
  await expect(async () => {
    expect(await barNotice(app)).toBe('Softened. Edit it or send as is.');
    // The button itself now rewrites in that way.
    expect((await toolNames(app))[0]).toBe('Soften');
  }).toPass();
  // Nothing was sent: the user presses Enter, and the notice goes with the draft.
  await expect(window.getByTestId('sent')).toHaveCount(0);
  await composer.click();
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('sent')).toHaveCount(1);
  await expect(async () => {
    expect(await barNotice(app)).toBeNull();
    expect(await toolNames(app)).toEqual([]);
  }).toPass({ timeout: 10_000 });
});

test('says the assistant is off in a chat the user did not add, and opens its settings', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  await settings.close();
  await focusMain(app);
  await window.getByTestId('composer').click();
  await window.keyboard.type('running late');
  await clickInTool(app, window, 'Polish');
  await expect(async () => {
    expect(await barNotice(app)).toBe(
      'The assistant is off in this chat. Turn it on in Settings, under Assistant.',
    );
  }).toPass();
  expect(await claudeRequests(app)).toEqual([]);
  await clickInBar(app, window, 'Open settings');
  await expect(
    (await chromePage(app, '/settings.html')).getByRole('region', { name: 'Assistant' }),
  ).toBeVisible();
});

test('says what is missing before the assistant is set up, and opens its settings from the menu', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await standInKeyring(app);
  await window.getByTestId('composer').click();
  await window.keyboard.type('running late');
  await clickInTool(app, window, 'Polish');
  await expect(async () => {
    expect(await barNotice(app)).toBe('Set up the assistant to start: choose where it thinks.');
  }).toPass();
  await clickInTool(app, window, 'Choose how to rewrite');
  await clickInTool(app, window, 'Assistant settings');
  await expect(
    (await chromePage(app, '/settings.html')).getByRole('region', { name: 'Assistant' }),
  ).toBeVisible();
});

test('finds the model server on this computer, and suggests replies with it', async ({
  fakeWhatsApp,
  profile,
}) => {
  const server = await fakeModelServer('Yes, 8 works!\nCan we do 9?\nSee you there');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    env: { YAPYAP_TEST_MODEL_PORTS: [await quietPort(), server.port].join(',') },
  });
  try {
    const window = await whatsAppPage(app);
    await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
    const settings = await openAssistantSettings(app);
    await settings.getByRole('button', { name: 'Find' }).click();
    await expect(settings.getByText(`localhost:${String(server.port)}: tiny-e2e`)).toBeVisible();
    await settings.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(settings.getByText('In use')).toBeVisible();
    await expect(
      settings.getByText('Right now, it goes to the model server on this computer.'),
    ).toBeVisible();
    await allowAllChats(settings);
    await focusMain(app);
    await messageArrives(window, '3EB0F7', 'Are we still on?');
    await expect(async () => {
      expect(await barNames(app)).toContain('Can we do 9?');
    }).toPass({ timeout: 15_000 });
    expect(server.chats).toHaveLength(1);
    expect(server.chats[0]).toContain('Them: Are we still on?');
    expect(server.chats[0]).toContain('"model":"tiny-e2e"');
  } finally {
    await closeApp(app);
    server.close();
  }
});

test('offers the model server it finds in the Welcome, and uses it on one click', async ({
  fakeWhatsApp,
  profile,
}) => {
  const server = await fakeModelServer('Hi');
  const app = await launchApp(fakeWhatsApp.origin, profile, [], {
    firstRun: true,
    env: { YAPYAP_TEST_MODEL_PORTS: String(server.port) },
  });
  try {
    const welcome = await chromePage(app, '/welcome.html');
    await expect(welcome.getByRole('heading', { name: 'Your AI assistant' })).toBeVisible();
    await expect(
      welcome.getByRole('button', { name: /^Download a Private Model \(\d/ }),
    ).toBeVisible();
    await welcome
      .getByRole('button', {
        name: `Use the Model Server on This Computer (localhost:${String(server.port)})`,
      })
      .click();
    await expect(welcome.getByText(/^Done\./)).toBeVisible();
    const settings = await openAssistantSettings(app);
    await expect(
      settings.getByRole('radio', { name: /A model server on this computer/ }),
    ).toBeChecked();
  } finally {
    await closeApp(app);
    server.close();
  }
});

test('opens the page to get a key in the default browser', async ({ app }) => {
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    Object.assign(globalThis, { openedLinks: opened });
    shell.openExternal = (url: string) => {
      opened.push(url);
      return Promise.resolve();
    };
  });
  const settings = await openAssistantSettings(app);
  await settings.getByRole('link', { name: 'Get a key from Anthropic' }).click();
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks),
    )
    .toEqual(['https://console.anthropic.com/settings/keys']);
});

test('takes suggestions away when another chat opens', async ({ app, window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass({ timeout: 15_000 });
  // WhatsApp draws the conversation anew for another chat, whose last message is the user's.
  await window.evaluate(() => {
    const parts = [
      ...document.querySelectorAll(
        '#main > [data-testid="wallpaper"], #main > header, #main > footer',
      ),
    ].map((part) => part.cloneNode(true) as Element);
    parts.find((part) => part.matches('header'))?.replaceChildren('Test Chat Three');
    document.querySelector('#main')?.replaceChildren(...parts);
  });
  await expect(async () => {
    expect(await barNames(app)).toEqual([]);
  }).toPass({ timeout: 10_000 });
});

test('keeps the chat’s last message in view as suggestions come and the bar comes back', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  await allowAllChats(settings);
  // A chat long enough to scroll, read to its end, as WhatsApp opens one.
  await window.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#main');
    const list = document.querySelector('[data-testid="conversation-panel-body"]');
    main?.style.setProperty('block-size', '360px');
    for (let index = 0; index < 30; index += 1) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.textContent = `Message ${String(index)}`;
      list?.append(row);
    }
    list?.scrollTo({ top: list.scrollHeight });
  });
  const lastMessageInView = (): Promise<boolean> =>
    window.evaluate(() => {
      const list = document.querySelector('[data-testid="conversation-panel-body"]');
      const last = list?.lastElementChild;
      return (
        list !== null &&
        last !== null &&
        last !== undefined &&
        last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1
      );
    });
  expect(await lastMessageInView()).toBe(true);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await window.evaluate(() => {
    const list = document.querySelector('[data-testid="conversation-panel-body"]');
    list?.scrollTo({ top: list.scrollHeight });
  });
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass({ timeout: 15_000 });
  expect(await lastMessageInView()).toBe(true);
  // WhatsApp draws the chat again without the bar, which comes back within a second.
  await window.evaluate(() => {
    document.querySelector('#main footer')?.previousElementSibling?.remove();
  });
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass();
  expect(await lastMessageInView()).toBe(true);
  // Picking a suggestion takes the row away, and the chat stays at its last message (#616).
  await clickInBar(app, window, 'Can we do 9?');
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  await expect(async () => {
    expect(await barNames(app)).toEqual([]);
  }).toPass();
  expect(await lastMessageInView()).toBe(true);
});

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
  messageEdited,
  openAssistantSettings,
  quietPort,
  readyClaude,
  settledRequests,
  standInKeyring,
  stickerArrives,
  toolNames,
} from './assistant-helpers.ts';
import { chromePage } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, mainWindow, test, whatsAppPage } from './fixtures.ts';

test('sets Claude up in Settings › AI Assistant, with the key encrypted, tested and in use', async ({
  app,
  profile,
}) => {
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  await expect(settings.getByText('Ready. Using Claude (Anthropic).')).toBeVisible();
  // The key never comes back to the page: only that one is saved.
  await expect(settings.getByLabel('API key', { exact: true })).toHaveText(/•+/);
  const kept = await readFile(join(profile, 'secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-ant-e2e-key');
  await settings.getByRole('button', { name: 'Test' }).click();
  await expect(settings.getByText('The key works.')).toBeVisible();
  // Auto picks the newest of Claude's best models from what the provider lists (#702).
  await expect(
    settings.getByRole('option', { name: 'Auto (recommended): Claude Sonnet 5.5' }),
  ).toBeAttached();
  await settings.getByRole('button', { name: 'Remove' }).click();
  await expect(settings.locator('#provider-anthropic-pill')).toHaveText('Needs key');
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
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
  await settings.getByRole('button', { name: 'Add Open Chat' }).click();
  await expect(settings.getByText(/: Test Chat One$/)).toBeVisible();
  await settings.close();
  await focusMain(app);
  await messageArrives(window, '3EB0F8', 'Dinner at 8 still?');
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass({ timeout: 15_000 });
  const asked = await claudeRequests(app);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('[20:05, 24/10/2026] Test Chat One: Dinner at 8 still?');
  expect(asked[0]).toContain('"model":"claude-sonnet-5-5"');
  // WhatsApp's page cannot read the suggestions.
  expect(await window.evaluate(() => document.body.innerText)).not.toContain('Can we do 9?');
  // A suggestion fills the message box, and never sends; the others stay to pick from (#743).
  await clickInBar(app, window, 'Can we do 9?');
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  await clickInBar(app, window, 'Yes, 8 works!');
  await expect(window.getByTestId('composer')).toHaveText('Yes, 8 works!');
  await expect(window.getByTestId('sent')).toHaveCount(0);
});

test('suggests after a sticker, and after the user’s own message (#723)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Every request gets this answer: the chat the window opens on may be asked about first.
  const settings = await readyClaude(app, claudeAnswer('Haha love it'));
  await allowAllChats(settings);
  await focusMain(app);
  await stickerArrives(window, '3EB0F9');
  await expect(async () => {
    expect(await barNames(app)).toContain('Haha love it');
  }).toPass({ timeout: 15_000 });
  const asked = await claudeRequests(app);
  expect(asked.at(-1)).toContain('Test Chat One: [a sticker]');
  // The user's own message is last now, and still has suggestions to follow it.
  await clickInBar(app, window, 'Haha love it');
  const composer = window.getByTestId('composer');
  await expect(composer).toHaveText('Haha love it');
  await composer.press('Enter');
  await expect(async () => {
    expect((await claudeRequests(app)).length).toBeGreaterThan(asked.length);
  }).toPass({ timeout: 15_000 });
  await expect(window.getByTestId('sent')).toHaveCount(1);
});

test('replaces the suggestions when a newer message arrives, asking once for a burst (#707)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(
    app,
    CLAUDE_ANSWER,
    { when: 'Third?', body: claudeAnswer('All three, yes') },
    { when: 'Hello?', body: claudeAnswer('Still on!') },
  );
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  await settledRequests(app, window);
  await messageArrives(window, '3EB0F8', 'Hello?');
  await expect(async () => {
    const names = await barNames(app);
    expect(names).toContain('Still on!');
    expect(names).not.toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const before = await settledRequests(app, window);
  // Three messages at once ask once, for the last of them.
  await messageArrives(window, '3EB0F9', 'First?');
  await messageArrives(window, '3EB0FA', 'Second?');
  await messageArrives(window, '3EB0FB', 'Third?');
  await expect(async () => {
    const names = await barNames(app);
    expect(names).toContain('All three, yes');
    expect(names).not.toContain('Still on!');
  }).toPass({ timeout: 15_000 });
  const asked = await claudeRequests(app);
  expect(await settledRequests(app, window)).toBe(before + 1);
  expect(asked.at(-1)).toContain('Third?');
});

test('makes the new message’s suggestions while the user drafts, and shows them there (#707, #743)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'Hello?',
    body: claudeAnswer('Still on!'),
  });
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('Sure');
  await messageArrives(window, '3EB0F8', 'Hello?');
  await expect(async () => {
    expect((await claudeRequests(app)).some((body) => body.includes('Hello?'))).toBe(true);
  }).toPass({ timeout: 15_000 });
  // They stay while the user drafts, so the new message's show there too.
  await expect(async () => {
    expect(await barNames(app)).toContain('Still on!');
  }).toPass({ timeout: 10_000 });
  await expect(composer).toHaveText('Sure');
});

test('asks nothing while the window is hidden or the assistant is off, and catches up when shown (#707)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'Hello?',
    body: claudeAnswer('Still on!'),
  });
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const shown = await settledRequests(app, window);
  const main = await mainWindow(app);
  await main.evaluate((owner) => {
    owner.hide();
  });
  await messageArrives(window, '3EB0F8', 'Hello?');
  await window.waitForTimeout(3500);
  expect(await claudeRequests(app)).toHaveLength(shown);
  await main.evaluate((owner) => {
    owner.show();
  });
  await focusMain(app);
  await expect(async () => {
    expect(await barNames(app)).toContain('Still on!');
  }).toPass({ timeout: 15_000 });
  const assistantSettings = await openAssistantSettings(app);
  await assistantSettings.getByRole('switch', { name: 'Show the AI assistant in chats' }).click();
  await expect(
    assistantSettings.getByRole('switch', { name: 'Show the AI assistant in chats' }),
  ).not.toBeChecked();
  await assistantSettings.close();
  await focusMain(app);
  const off = await settledRequests(app, window);
  await messageArrives(window, '3EB0F9', 'Bye?');
  await window.waitForTimeout(3500);
  expect(await claudeRequests(app)).toHaveLength(off);
  expect(await barNames(app)).toEqual([]);
});

test('keeps suggestions while the user types, and folds them away until the user shows them (#729, #743)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'Hello?',
    body: claudeAnswer('Still on!'),
  });
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const beforeTyping = await settledRequests(app, window);
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('Sure');
  await window.waitForTimeout(500);
  expect(await barNames(app)).toContain('See you there');
  // Picking one over a draft replaces it, with Undo.
  await clickInBar(app, window, 'See you there');
  await expect(composer).toHaveText('See you there');
  await expect(async () => {
    expect(await barNotice(app)).toBe('Replaced your draft.');
  }).toPass();
  // Undo shows in place of the suggestions, which come back with the draft (#743).
  expect(await barNames(app)).not.toContain('See you there');
  await clickInBar(app, window, 'Undo');
  await expect(composer).toHaveText('Sure');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass();
  for (let index = 0; index < 4; index += 1) {
    await window.keyboard.press('Backspace');
  }
  await clickInBar(app, window, 'Hide suggestions');
  await expect(async () => {
    expect(await barNames(app)).toEqual(['Show suggestions']);
  }).toPass();
  // Folded away, they stay folded as the next message's are made.
  await messageArrives(window, '3EB0F8', 'Hello?');
  await expect(async () => {
    expect((await claudeRequests(app)).at(-1)).toContain('Hello?');
  }).toPass({ timeout: 15_000 });
  await window.waitForTimeout(1500);
  expect(await barNames(app)).toEqual(['Show suggestions']);
  await clickInBar(app, window, 'Show suggestions');
  await expect(async () => {
    expect(await barNames(app)).toEqual(['Hide suggestions', 'Still on!']);
  }).toPass();
  // Typing, clearing, folding and showing ask nothing; only the new message does.
  expect(await claudeRequests(app)).toHaveLength(beforeTyping + 1);
});

test('brings the suggestions back and drops Undo once the user empties a rewritten draft', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'Rewrite my draft',
    body: claudeAnswer('Sure, see you there!'),
  });
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  await settledRequests(app, window);
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('sure c u');
  await clickInTool(app, window, 'Polish');
  await expect(composer).toHaveText('Sure, see you there!');
  await expect(async () => {
    expect(await barNotice(app)).toBe('Polished. Edit it or send as is.');
  }).toPass();
  // Undo shows in place of the suggestions, which come back with the draft (#743).
  expect(await barNames(app)).not.toContain('See you there');
  await clickInBar(app, window, 'Undo');
  await expect(composer).toHaveText('sure c u');
  await expect(async () => {
    expect(await barNotice(app)).toBeNull();
    expect(await barNames(app)).toContain('See you there');
  }).toPass();
  await clickInTool(app, window, 'Polish');
  await expect(composer).toHaveText('Sure, see you there!');
  const beforeClearing = (await claudeRequests(app)).length;
  // As the user clears the box, here at once, as select-all and Delete does.
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.press('Delete');
  await expect(async () => {
    expect(await barNotice(app)).toBeNull();
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 10_000 });
  await expect(async () => {
    expect(await toolNames(app)).toEqual([]);
  }).toPass();
  // The suggestions come back as they were, without asking again.
  const asked = await claudeRequests(app);
  expect(asked).toHaveLength(beforeClearing);
  expect(asked.filter((body) => body.includes('Rewrite my draft'))).toHaveLength(2);
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
  // The chat the window opened on may have been asked about for suggestions first (#725).
  const rewrites = (await claudeRequests(app)).filter((body) => body.includes('Rewrite my draft'));
  expect(rewrites).toHaveLength(1);
  const [asked] = rewrites;
  expect(asked).toContain('Rewrite my draft below the Polish way');
  expect(asked).toContain('<draft>\\nrunning late\\n</draft>');
  // The rewrite reads the chat it answers, and the chat is cached for the next request.
  expect(asked).toContain('[19:58, 24/10/2026] Test Chat One: Dinner tonight?');
  expect(asked).toContain('"cache_control":{"type":"ephemeral"}');
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
      'AI Assistant settings',
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
      'The AI assistant is off in this chat. Turn it on in Settings → AI Assistant.',
    );
  }).toPass();
  expect(await claudeRequests(app)).toEqual([]);
  await clickInBar(app, window, 'Open Settings');
  await expect(
    (await chromePage(app, '/settings.html')).getByRole('heading', {
      level: 1,
      name: 'AI Assistant',
    }),
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
    expect(await barNotice(app)).toBe('Set up the AI assistant to start: choose a provider.');
  }).toPass();
  await clickInTool(app, window, 'Choose how to rewrite');
  await clickInTool(app, window, 'AI Assistant settings');
  await expect(
    (await chromePage(app, '/settings.html')).getByRole('heading', {
      level: 1,
      name: 'AI Assistant',
    }),
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
    await settings.getByRole('radio', { name: 'Model server' }).check();
    await settings.getByRole('button', { name: 'Find on This Computer' }).click();
    await expect(settings.getByText(`localhost:${String(server.port)}: tiny-e2e`)).toBeVisible();
    await settings.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(settings.getByText('Ready. Using Model server.')).toBeVisible();
    await expect(settings.getByText('Everything stays on this computer.')).toBeVisible();
    await allowAllChats(settings);
    await focusMain(app);
    await messageArrives(window, '3EB0F7', 'Are we still on?');
    await expect(async () => {
      expect(await barNames(app)).toContain('Can we do 9?');
    }).toPass({ timeout: 15_000 });
    // The chat the window opened on may have been asked about first (#725).
    const answered = server.chats.filter((body) =>
      body.includes('[20:05, 24/10/2026] Test Chat One: Are we still on?'),
    );
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.at(-1)).toContain('"model":"tiny-e2e"');
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
    // The welcome opens once WhatsApp's first load ends, which a cold Windows
    // runner can take longer than an expectation's timeout to reach (#507).
    await (await whatsAppPage(app)).waitForLoadState('load');
    const welcome = await chromePage(app, '/welcome.html');
    await expect(welcome.getByRole('heading', { name: 'Your AI assistant' })).toBeVisible();
    await expect(welcome.getByRole('button', { name: /Private/ })).toHaveCount(0);
    await welcome
      .getByRole('button', {
        name: `Use the Model Server on This Computer (localhost:${String(server.port)})`,
      })
      .click();
    await expect(welcome.getByText(/^Done\./)).toBeVisible();
    const settings = await openAssistantSettings(app);
    await expect(settings.getByRole('radio', { name: 'Model server' })).toBeChecked();
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
  await settings.getByRole('radio', { name: 'Claude (Anthropic)' }).check();
  await settings.getByRole('link', { name: 'Get a key from Anthropic' }).click();
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { openedLinks: string[] }).openedLinks),
    )
    .toEqual(['https://console.anthropic.com/settings/keys']);
});

test('takes suggestions away when another chat opens, never showing them there (#730)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'This is a chat with Test Chat Three.',
    body: claudeAnswer('Hi there'),
  });
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
    const name = document.createElement('span');
    name.dir = 'auto';
    name.textContent = 'Test Chat Three';
    parts.find((part) => part.matches('header'))?.replaceChildren(name);
    document.querySelector('#main')?.replaceChildren(...parts);
  });
  // The bar comes back into the new chat within a second, before the next look tells YapYap
  // another chat opened: the old chat's suggestions must not come back with it.
  for (let check = 0; check < 25; check += 1) {
    expect(await barNames(app)).not.toContain('Can we do 9?');
    await window.waitForTimeout(100);
  }
  await expect(async () => {
    expect(await barNames(app)).toContain('Hi there');
  }).toPass({ timeout: 15_000 });
});

test('says why no suggestions came, and asks again on Try Again (#743)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Every answer has nothing usable in it, until the test lets the model answer.
  const settings = await readyClaude(app, claudeAnswer('NONE'));
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNotice(app)).toBe('No suggestions this time.');
  }).toPass({ timeout: 15_000 });
  await app.evaluate(({ session }, body) => {
    const protocol = session.fromPartition('yapyap-assistant').protocol;
    protocol.unhandle('https');
    protocol.handle('https', () =>
      Promise.resolve(new Response(body, { headers: { 'content-type': 'text/event-stream' } })),
    );
  }, CLAUDE_ANSWER);
  await clickInBar(app, window, 'Try Again');
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
    expect(await barNotice(app)).toBeNull();
  }).toPass({ timeout: 15_000 });
});

test('keeps the suggestions while the chat’s header lays itself out again (#741)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // Part of the name is laid out only later, as WhatsApp's header can be: its text stays the same.
  await window.evaluate(() => {
    const later = document.createElement('span');
    later.hidden = true;
    later.textContent = ' ✓';
    document.querySelector('#main header span[dir="auto"]')?.append(later);
  });
  const settings = await readyClaude(app, CLAUDE_ANSWER);
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'Are we still on?');
  await expect(async () => {
    expect(await barNames(app)).toContain('Can we do 9?');
  }).toPass({ timeout: 15_000 });
  const asked = await settledRequests(app, window);
  await window.evaluate(() => {
    document
      .querySelector<HTMLElement>('#main header span[dir="auto"] span')
      ?.removeAttribute('hidden');
  });
  // The same chat on screen: its suggestions stay, and nothing is asked again.
  for (let check = 0; check < 25; check += 1) {
    expect(await barNames(app)).toContain('Can we do 9?');
    await window.waitForTimeout(100);
  }
  expect(await claudeRequests(app)).toHaveLength(asked);
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
  // Picking a suggestion keeps the others, and the chat stays at its last message (#616, #743).
  await clickInBar(app, window, 'Can we do 9?');
  await expect(window.getByTestId('composer')).toHaveText('Can we do 9?');
  await window.waitForTimeout(500);
  expect(await lastMessageInView()).toBe(true);
});

test('writes the suggestions again when the contact edits the chat’s last message (#739)', async ({
  app,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  const settings = await readyClaude(app, CLAUDE_ANSWER, {
    when: 'See you at 6',
    body: claudeAnswer('6 works!'),
  });
  await allowAllChats(settings);
  await focusMain(app);
  await messageArrives(window, '3EB0F7', 'See you at 5');
  await expect(async () => {
    expect(await barNames(app)).toContain('See you there');
  }).toPass({ timeout: 15_000 });
  const before = await settledRequests(app, window);
  // An edit keeps the message's ID; only what it says changed.
  await messageEdited(window, '3EB0F7', 'See you at 6');
  await expect(async () => {
    expect(await barNames(app)).toContain('6 works!');
  }).toPass({ timeout: 15_000 });
  const asked = await claudeRequests(app);
  expect(asked).toHaveLength(before + 1);
  expect(asked.at(-1)).toContain('See you at 6');
  // Looking on, the same edit asks nothing more.
  await window.waitForTimeout(3000);
  expect(await claudeRequests(app)).toHaveLength(before + 1);
});

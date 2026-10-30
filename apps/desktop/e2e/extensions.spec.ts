import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/extensions.ts';
import { closeApp, expect, launchApp, test } from './fixtures.ts';
import {
  assistantBarControls,
  chromePage,
  clickInBar,
  clickMenu,
  installExtension,
  extensionPage,
  runExtensionCommand,
} from './extension-helpers.ts';
import { clickLastItem, lastMenu, recordMenus, shownMenus } from './menu-helpers.ts';

test('installs a third-party extension only once the user accepts the risk, and marks it', async ({
  app,
  profile,
}) => {
  // Signed with a key made for this run and kept in memory (ADR 0005).
  const archive = join(profile, 'hello.yapyap-extension');
  await writeFile(archive, zipArchive(signedArchive(testKey())));
  await app.evaluate(({ dialog }, path) => {
    const messages: string[] = [];
    Object.assign(globalThis, { extensionMessages: messages });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = (options: unknown) => {
      messages.push((options as { message: string }).message);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Extension…');
  const consent = await chromePage(app, '/extension-consent.html');
  await expect(consent.getByRole('heading', { name: 'Install Hello?' })).toBeVisible();
  await expect(consent.getByText(/you install it at your own risk/)).toBeVisible();
  const install = consent.getByRole('button', { name: 'Install' });
  await expect(install).toBeDisabled();
  await consent.getByLabel('I understand that I install this extension at my own risk').check();
  // Install closes the window, which can end the click before Playwright sees it
  // finish; the poll below checks that it installed.
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as unknown as { extensionMessages: string[] }).extensionMessages,
      ),
    )
    .toEqual(['Hello 1.0.0 is installed.']);
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  await expect(extensions.getByText('org.example.hello')).toBeVisible();
  await expect(extensions.getByText('Third-party')).toBeVisible();
});

/** What the extension's script found it could and could not do, as it wrote in its title. */
const PROBE = `
const tried = [];
try { eval('1'); tried.push('eval'); } catch { tried.push('no-eval'); }
try { await fetch('https://example.com/'); tried.push('online'); } catch { tried.push('offline'); }
tried.push(window.open('https://example.com/') === null ? 'no-popup' : 'popup');
document.title = tried.join(' ');
export {};
`;

test('runs an installed extension hidden, on its own session, with no eval and no network', async ({
  app,
  profile,
}) => {
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: [], network: { hosts: [] } }),
    PROBE,
  );
  await expect
    .poll(() => extensionPage(app), { timeout: 20_000 })
    .toEqual({
      url: 'extension://org.example.hello/',
      title: 'no-eval offline no-popup',
      shown: false,
      persistent: false,
      ownSession: true,
    });
  // Its window stays hidden: nothing an extension does can show it.
  expect((await extensionPage(app))?.shown).toBe(false);
  // Its fetch to a host it never declared made YapYap ask, and the user said no.
  expect(
    await app.evaluate(() => (globalThis as { extensionPrompts?: string[] }).extensionPrompts),
  ).toContain('Let Hello connect to example.com?');
});

/** Shows a notification, then writes in its title how that went. */
const NOTIFIER = `
export default {
  async activate(host) {
    try {
      await host.notifications.show({ title: 'Done', body: 'Your draft is ready.' });
      document.title = 'ok';
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('answers an extension’s calls over its port, only for what it was granted', async ({
  app,
  profile,
}) => {
  await app.evaluate(({ Notification }) => {
    const shown: string[] = [];
    Object.assign(globalThis, { extensionNotifications: shown });
    Notification.prototype.show = function show(this: Electron.Notification) {
      shown.push(`${this.title} / ${this.body}`);
    };
  });
  const network = { hosts: [] };
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['notifications:show'], network }),
    NOTIFIER,
  );
  await expect.poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 }).toBe('ok');
  const quiet = testManifest({ id: 'org.example.quiet', name: 'Quiet', capabilities: [], network });
  await installExtension(app, profile, quiet, NOTIFIER);
  await expect
    .poll(async () => (await extensionPage(app, 'org.example.quiet'))?.title, { timeout: 20_000 })
    .toBe('not-granted');
  expect(
    await app.evaluate(
      () => (globalThis as { extensionNotifications?: string[] }).extensionNotifications,
    ),
  ).toEqual(['Hello: Done / Your draft is ready.']);
  // The Extensions window shows both calls and how each went, never what they carried.
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  const activity = extensions.getByRole('region', { name: 'Recent activity' });
  await expect(activity.getByRole('listitem')).toHaveCount(2);
  await expect(activity.getByRole('listitem').first()).toContainText('org.example.quiet');
  await expect(activity.getByRole('listitem').first()).toContainText('Refused: not allowed');
  await expect(activity.getByRole('listitem').last()).toContainText('Show notificationsDone');
  await expect(activity).not.toContainText('Your draft is ready.');
});

/** Keeps a secret and reads it back, or only reads it, and writes what it got in its title. */
const keeper = (store: boolean) => `
export default {
  async activate(host) {
    try {
      ${store ? "await host.secrets.set('apiKey', 'sk-test');" : ''}
      document.title = String(await host.secrets.get('apiKey'));
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('keeps each extension’s secrets to itself', async ({ app, profile }) => {
  // The test system has no keyring, so encryption is stood in for, reversibly.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
  });
  const network = { hosts: [] };
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['secrets:own'], network }),
    keeper(true),
  );
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('sk-test');
  const other = testManifest({
    id: 'org.example.other',
    name: 'Other',
    capabilities: ['secrets:own'],
    network,
  });
  await installExtension(app, profile, other, keeper(false));
  await expect
    .poll(async () => (await extensionPage(app, 'org.example.other'))?.title, { timeout: 20_000 })
    .toBe('undefined');
  // What the file keeps is what the system's encryption made of the secret.
  const kept = await readFile(join(profile, 'extensions', '.secrets.json'), 'utf8');
  expect(kept).not.toContain('sk-test');
});

/** Counts its starts in its storage, or only reads the count, and writes it in its title. */
const counter = (count: boolean) => `
export default {
  async activate(host) {
    try {
      const starts = (await host.storage.get('starts')) ?? 0;
      ${count ? "await host.storage.set('starts', starts + 1);" : ''}
      document.title = String(${count ? 'starts + 1' : 'starts'});
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('keeps each extension’s storage to itself, across restarts', async ({
  fakeWhatsApp,
  profile,
}) => {
  const network = { hosts: [] };
  const first = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await installExtension(
      first,
      profile,
      testManifest({ capabilities: ['storage:local'], network }),
      counter(true),
    );
    await expect
      .poll(async () => (await extensionPage(first))?.title, { timeout: 20_000 })
      .toBe('1');
    const other = { id: 'org.example.other', name: 'Other', capabilities: ['storage:local'] };
    await installExtension(first, profile, testManifest({ ...other, network }), counter(false));
    await expect
      .poll(async () => (await extensionPage(first, 'org.example.other'))?.title, {
        timeout: 20_000,
      })
      .toBe('0');
  } finally {
    await closeApp(first);
  }
  const second = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect
      .poll(async () => (await extensionPage(second))?.title, { timeout: 20_000 })
      .toBe('2');
  } finally {
    await closeApp(second);
  }
  const kept = await readFile(
    join(profile, 'extensions', '.storage', 'org.example.hello.json'),
    'utf8',
  );
  expect(JSON.parse(kept)).toEqual({ version: 1, entries: { starts: '2' } });
});

/** Drafts a reply, then writes in its title how that went. */
const DRAFTER = `
export default {
  async activate(host) {
    try {
      await host.composer.insertDraft('Sounds good, see you at 8.');
      document.title = 'drafted';
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('puts an extension’s draft in the open chat’s message box, for the user to send', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['composer:insert-draft'], network: { hosts: [] } }),
    DRAFTER,
  );
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('drafted');
  await expect(window.getByTestId('composer')).toHaveText('Sounds good, see you at 8.');
});

/** Shows a notification every half second, and writes in its title how the last one went. */
const PERSISTENT = `
export default {
  activate(host) {
    setInterval(() => {
      host.notifications.show({ title: 'Ping', body: '' }).then(
        () => { document.title = 'ok'; },
        (error) => { document.title = error.kind; },
      );
    }, 500);
  },
};
`;

test('stops an extension’s calls as soon as the user takes the permission back', async ({
  app,
  profile,
}) => {
  await app.evaluate(({ Notification }) => {
    Notification.prototype.show = () => undefined;
  });
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['notifications:show'], network: { hosts: [] } }),
    PERSISTENT,
  );
  await expect.poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 }).toBe('ok');
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  await extensions.getByText('Permissions').click();
  await extensions.getByRole('checkbox', { name: 'Show notifications' }).uncheck();
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('not-granted');
  await extensions.getByRole('checkbox', { name: 'Show notifications' }).check();
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('ok');
  await expect(extensions.getByRole('checkbox', { name: 'Show notifications' })).toBeChecked();
});

/** Writes in its title when the user runs its command. */
const GREETER = `
export default {
  activate(host) {
    document.title = 'waiting';
    host.commands.onRun('greet', () => {
      document.title = 'greeted';
    });
  },
};
`;

test('lists an extension’s commands in the menu under its name, and runs the one the user picks', async ({
  app,
  profile,
}) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: { commands: [{ id: 'greet', title: 'Say hello' }] },
  });
  await installExtension(app, profile, manifest, GREETER);
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('waiting');
  await expect.poll(() => runExtensionCommand(app, 'Hello: Say hello')).toBe(true);
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('greeted');
  expect((await extensionPage(app))?.shown).toBe(false);
});

/** Writes its settings in its title every half second. */
const CONFIGURED = `
export default {
  activate(host) {
    setInterval(() => {
      host.settings.get().then((settings) => {
        document.title = JSON.stringify(settings);
      });
    }, 500);
  },
};
`;

test('gives an extension the settings the user chose in its form', async ({ app, profile }) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: {
      settings: {
        type: 'object',
        properties: { model: { type: 'string', title: 'Model', enum: ['small', 'large'] } },
      },
    },
  });
  await installExtension(app, profile, manifest, CONFIGURED);
  await expect.poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 }).toBe('{}');
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  await extensions.getByText('Settings').click();
  await extensions.getByLabel('Model').selectOption('large');
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('{"model":"large"}');
  await expect(extensions.getByLabel('Model')).toHaveValue('large');
});

/** Writes in its title which of its commands the user ran. */
const ACTOR = `
export default {
  activate(host) {
    document.title = 'waiting';
    for (const id of ['fix', 'explain', 'summarize']) {
      host.commands.onRun(id, () => {
        document.title = id;
      });
    }
  },
};
`;

test('adds an extension’s items to right clicks on the message box, a message and a chat', async ({
  app,
  profile,
  window,
}) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: {
      commands: [
        { id: 'fix', title: 'Fix spelling' },
        { id: 'explain', title: 'Explain message' },
        { id: 'summarize', title: 'Summarize chat' },
      ],
      composerActions: [{ title: 'Fix spelling', command: 'fix' }],
      contextMenu: [
        { title: 'Explain', command: 'explain', on: 'message' },
        { title: 'Summarize', command: 'summarize', on: 'chat' },
      ],
    },
  });
  await installExtension(app, profile, manifest, ACTOR);
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('waiting');
  await recordMenus(app);
  const rightClick = async (testId: string) => {
    const before = await shownMenus(app);
    await window.getByTestId(testId).click({ button: 'right' });
    await expect.poll(() => shownMenus(app)).toBeGreaterThan(before);
    return lastMenu(app);
  };
  expect((await rightClick('composer'))?.at(-1)).toBe('Hello: Fix spelling');
  await clickLastItem(app);
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('fix');
  // macOS selects the word under the pointer, so Copy may come first.
  expect((await rightClick('message'))?.at(-1)).toBe('Hello: Explain');
  await clickLastItem(app);
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('explain');
  expect((await rightClick('chat'))?.at(-1)).toBe('Hello: Summarize');
  await clickLastItem(app);
  await expect.poll(async () => (await extensionPage(app))?.title).toBe('summarize');
});

/** A panel that says it loaded, and tries to retitle its window. */
const PANEL = `
document.body.textContent = 'Notes for this chat';
document.title = 'WhatsApp';
`;

test('opens an extension’s panel in a window of its own, titled with the extension’s name', async ({
  app,
  profile,
}) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: { panel: { title: 'Notes', entry: 'panel.js' } },
  });
  await installExtension(app, profile, manifest, 'export default { activate() {} };', {
    'panel.js': PANEL,
  });
  const open = () =>
    app.evaluate(({ Menu }) => {
      const extensions = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Extension Commands');
      const panel = extensions?.submenu?.items.find((entry) => entry.label === 'Hello: Notes');
      panel?.click();
      return panel !== undefined;
    });
  await expect.poll(open, { timeout: 20_000 }).toBe(true);
  const panel = await chromePage(app, '/__yapyap/panel.html');
  await expect(panel.locator('body')).toHaveText('Notes for this chat');
  const title = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().endsWith('/__yapyap/panel.html'))
        ?.getTitle(),
    );
  await expect.poll(title).toBe('Hello: Notes');
  expect(await open()).toBe(true);
  expect(app.windows().filter((page) => page.url().endsWith('/__yapyap/panel.html'))).toHaveLength(
    1,
  );
});

/** Reads the open chat, and writes in its title what it got. */
const READER = `
export default {
  async activate(host) {
    try {
      document.title = JSON.stringify(await host.chat.readActive());
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('reads the open chat for an extension allowed to, as plain data', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['chat:read-active'], network: { hosts: [] } }),
    READER,
  );
  // Until the extension writes its title, the page is titled with its address.
  const read = async () => {
    try {
      return JSON.parse((await extensionPage(app))?.title ?? 'null') as unknown;
    } catch {
      return undefined;
    }
  };
  await expect.poll(read, { timeout: 20_000 }).toEqual({
    name: 'Test Chat One',
    group: false,
    messages: [
      { outgoing: false, text: 'Dinner tonight?' },
      { outgoing: true, text: 'See you at 8' },
    ],
  });
});

/** Asks a model server on this computer for a reply as an API client would, and writes it in its title. */
const LOCAL = `
export default {
  async activate() {
    try {
      const response = await fetch('__LOCAL__', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
        body: '{}',
      });
      document.title = await response.text();
    } catch {
      document.title = 'blocked';
    }
  },
};
`;

/**
 * A model server like Ollama (#430): it refuses any request with an Origin
 * it does not list, which an extension's never is, and sends no CORS headers.
 */
async function localModelServer(): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((request, response) => {
    response.writeHead(request.headers.origin === undefined ? 200 : 403);
    response.end(request.headers.origin === undefined ? 'reached' : '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/v1/chat/completions`,
    close: () => server.close(),
  };
}

test('lets an extension use a server on this computer only with local-network and the user’s approval', async ({
  app,
  profile,
}) => {
  const server = await localModelServer();
  try {
    const local = LOCAL.replace('__LOCAL__', server.url);
    const network = { hosts: [] };
    await installExtension(app, profile, testManifest({ capabilities: [], network }), local);
    await expect
      .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
      .toBe('blocked');
    const granted = testManifest({
      id: 'org.example.local',
      name: 'Local',
      capabilities: ['local-network'],
      network,
    });
    const host = new URL(server.url).host;
    const prompt = `Let Local use the server at ${host} on this computer?`;
    await installExtension(app, profile, granted, local, {}, prompt);
    await expect
      .poll(async () => (await extensionPage(app, 'org.example.local'))?.title, {
        timeout: 20_000,
      })
      .toBe('reached');
    expect(
      await app.evaluate(() => (globalThis as { extensionPrompts?: string[] }).extensionPrompts),
    ).toContain(prompt);
    expect((await extensionPage(app))?.title).toBe('blocked');
  } finally {
    server.close();
  }
});

/** Reads the draft, writes it in its title, and replaces it in shouting. */
const SHOUTER = `
export default {
  async activate(host) {
    try {
      const draft = await host.composer.readDraft();
      await host.composer.replaceDraft(draft.toUpperCase());
      document.title = 'read: ' + draft;
    } catch (error) {
      document.title = error.kind;
    }
  },
};
`;

test('lets an extension read and replace the draft only with the grant to read it', async ({
  app,
  profile,
  window,
}) => {
  const composer = window.getByTestId('composer');
  await composer.click();
  await window.keyboard.type('see you soon');
  const network = { hosts: [] };
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['composer:insert-draft'], network }),
    SHOUTER,
  );
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('not-granted');
  const reader = testManifest({
    id: 'org.example.reader',
    name: 'Reader',
    capabilities: ['composer:insert-draft', 'composer:read-draft'],
    network,
  });
  await installExtension(app, profile, reader, SHOUTER);
  await expect
    .poll(async () => (await extensionPage(app, 'org.example.reader'))?.title, { timeout: 20_000 })
    .toBe('read: see you soon');
  await expect(composer).toHaveText('SEE YOU SOON');
});

/**
 * Keeps a value in each place an extension can, and writes in its title whether
 * any was already there from before.
 */
const HOARDER = `
export default {
  async activate(host) {
    const before = [
      await host.storage.get('kept'),
      await host.secrets.get('kept'),
      localStorage.getItem('kept'),
    ].filter((value) => value !== undefined && value !== null);
    await host.storage.set('kept', 'yes');
    await host.secrets.set('kept', 'yes');
    localStorage.setItem('kept', 'yes');
    document.title = before.length === 0 ? 'fresh' : 'leftover';
  },
};
`;

test('removes an extension with everything it kept, once the user confirms', async ({
  app,
  profile,
}) => {
  // The test system has no keyring, so encryption is stood in for, reversibly.
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isAsyncEncryptionAvailable = () => Promise.resolve(true);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptStringAsync = (text: string) =>
      Promise.resolve(Buffer.from(`sealed:${text}`));
    safeStorage.decryptStringAsync = (sealed: Buffer) =>
      Promise.resolve({
        result: sealed.toString().slice('sealed:'.length),
        shouldReEncrypt: false,
      });
  });
  const manifest = testManifest({
    capabilities: ['storage:local', 'secrets:own'],
    network: { hosts: [] },
  });
  await installExtension(app, profile, manifest, HOARDER);
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('fresh');
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  const remove = extensions.getByRole('button', { name: 'Remove org.example.hello' });
  // Cancel, the dialog's default, keeps the extension running.
  await remove.click();
  await expect(remove).toBeEnabled();
  expect((await extensionPage(app))?.title).toBe('fresh');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false });
  });
  await remove.click();
  await expect(extensions.getByText('No extensions are installed.')).toBeVisible();
  expect(await extensionPage(app)).toBeNull();
  const folder = join(profile, 'extensions');
  expect(await readFile(join(folder, '.secrets.json'), 'utf8')).not.toContain('org.example.hello');
  await expect(readFile(join(folder, '.storage', 'org.example.hello.json'))).rejects.toThrow();
  await expect(readFile(join(folder, 'org.example.hello', '1.0.0', 'main.js'))).rejects.toThrow();
  // Installed again, it finds nothing of what it kept before.
  await installExtension(app, profile, manifest, HOARDER);
  await expect
    .poll(async () => (await extensionPage(app))?.title, { timeout: 20_000 })
    .toBe('fresh');
});

test('shows an extension installed while the Extensions window is open', async ({
  app,
  profile,
}) => {
  await clickMenu(app, 'Extensions…');
  const extensions = await chromePage(app, '/extensions.html');
  await expect(extensions.getByText('No extensions are installed.')).toBeVisible();
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: [], network: { hosts: [] } }),
    'export default { activate() {} };',
  );
  await expect(extensions.getByRole('button', { name: 'Remove org.example.hello' })).toBeVisible();
});

/** Offers a suggestion for every request the bar makes: what the user asked for, or a stock one. */
const SUGGESTER = `
export default {
  activate(host) {
    host.assistant.onRequest((request) =>
      host.assistant.offer({
        suggestions: [request.type === 'prompt' ? 'You asked: ' + request.text : 'On my way!'],
      }),
    );
  },
};
`;

test('asks for suggestions on its own when a message arrives in the open chat', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['assistant:bar'], network: { hosts: [] } }),
    SUGGESTER,
  );
  // A virtual display without a window manager focuses nothing on its own.
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => {
        const [main] = BrowserWindow.getAllWindows();
        main?.focus();
        return main?.isFocused();
      }),
    )
    .toBe(true);
  const names = async () => (await assistantBarControls(app))?.map(({ name }) => name);
  await expect.poll(names).toEqual(['Suggest replies', 'Write a message']);
  // What is already there when the bar first looks asks for nothing.
  await window.waitForTimeout(2000);
  expect(await names()).toEqual(['Suggest replies', 'Write a message']);
  await window.evaluate(() => {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.innerHTML =
      '<div data-id="3EB0F9"><span data-testid="selectable-text">Still on?</span></div>';
    const rows = document.querySelectorAll('#main [role="row"]');
    rows[rows.length - 1]?.after(row);
  });
  await expect
    .poll(names, { timeout: 10_000 })
    .toEqual(['Suggest replies', 'On my way!', 'Send this suggestion now', 'Write a message']);
});

test('sends an extension’s suggestion from the bar above the message box only on the user’s click', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installExtension(
    app,
    profile,
    testManifest({ capabilities: ['assistant:bar'], network: { hosts: [] } }),
    SUGGESTER,
  );
  await clickInBar(app, window, 'Suggest replies');
  await expect
    .poll(async () => (await assistantBarControls(app))?.map(({ name }) => name))
    .toEqual(['Suggest replies', 'On my way!', 'Send this suggestion now', 'Write a message']);
  // The bar sits right above the message box, and WhatsApp cannot read what it shows.
  const page = await window.evaluate(() => {
    const host = document.querySelector('#main footer')?.previousElementSibling;
    return { shadow: host?.shadowRoot, text: document.body.innerText };
  });
  expect(page.shadow).toBeNull();
  expect(page.text).not.toContain('On my way!');
  await expect(window.getByTestId('sent')).toHaveCount(0);
  await clickInBar(app, window, 'On my way!');
  await expect(window.getByTestId('composer')).toHaveText('On my way!');
  await clickInBar(app, window, 'Send this suggestion now');
  await expect(window.getByTestId('sent')).toHaveText('On my way!');
  await expect(window.getByTestId('composer')).toHaveText('');
  // Typing in the bar's field stays there, and Enter asks the extension.
  await clickInBar(app, window, 'Write a message');
  await window.keyboard.type('say I am late');
  await window.keyboard.press('Enter');
  await expect
    .poll(async () => (await assistantBarControls(app))?.map(({ name }) => name))
    .toContain('You asked: say I am late');
  await expect(window.getByTestId('composer')).toHaveText('');
  await expect(window.getByTestId('sent')).toHaveCount(1);
});

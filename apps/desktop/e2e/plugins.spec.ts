import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { signedArchive, testKey, testManifest, zipArchive } from '../test/plugins.ts';
import { closeApp, expect, launchApp, test } from './fixtures.ts';
import {
  chromePage,
  clickMenu,
  installPlugin,
  pluginPage,
  runPluginCommand,
} from './plugin-helpers.ts';
import { clickLastItem, lastMenu, recordMenus, shownMenus } from './menu-helpers.ts';

test('installs a third-party plugin only once the user accepts the risk, and marks it', async ({
  app,
  profile,
}) => {
  // Signed with a key made for this run and kept in memory (ADR 0005).
  const archive = join(profile, 'hello.yapyap-plugin');
  await writeFile(archive, zipArchive(signedArchive(testKey())));
  await app.evaluate(({ dialog }, path) => {
    const messages: string[] = [];
    Object.assign(globalThis, { pluginMessages: messages });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = (options: unknown) => {
      messages.push((options as { message: string }).message);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    };
  }, archive);
  await clickMenu(app, 'Install Plugin…');
  const consent = await chromePage(app, '/plugin-consent.html');
  await expect(consent.getByRole('heading', { name: 'Install Hello?' })).toBeVisible();
  await expect(consent.getByText(/you install it at your own risk/)).toBeVisible();
  const install = consent.getByRole('button', { name: 'Install' });
  await expect(install).toBeDisabled();
  await consent.getByLabel('I understand that I install this plugin at my own risk').check();
  // Install closes the window, which can end the click before Playwright sees it
  // finish; the poll below checks that it installed.
  await Promise.all([consent.waitForEvent('close'), install.click().catch(() => undefined)]);
  await expect
    .poll(() =>
      app.evaluate(() => (globalThis as unknown as { pluginMessages: string[] }).pluginMessages),
    )
    .toEqual(['Hello 1.0.0 is installed.']);
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await expect(plugins.getByText('org.example.hello')).toBeVisible();
  await expect(plugins.getByText('Third-party')).toBeVisible();
});

/** What the plugin's script found it could and could not do, as it wrote in its title. */
const PROBE = `
const tried = [];
try { eval('1'); tried.push('eval'); } catch { tried.push('no-eval'); }
try { await fetch('https://example.com/'); tried.push('online'); } catch { tried.push('offline'); }
tried.push(window.open('https://example.com/') === null ? 'no-popup' : 'popup');
document.title = tried.join(' ');
export {};
`;

test('runs an installed plugin hidden, on its own session, with no eval and no network', async ({
  app,
  profile,
}) => {
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: [], network: { hosts: [] } }),
    PROBE,
  );
  await expect
    .poll(() => pluginPage(app), { timeout: 20_000 })
    .toEqual({
      url: 'plugin://org.example.hello/',
      title: 'no-eval offline no-popup',
      shown: false,
      persistent: false,
      ownSession: true,
    });
  // Its window stays hidden: nothing a plugin does can show it.
  expect((await pluginPage(app))?.shown).toBe(false);
  // Its fetch to a host it never declared made YapYap ask, and the user said no.
  expect(
    await app.evaluate(() => (globalThis as { pluginPrompts?: string[] }).pluginPrompts),
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

test('answers a plugin’s calls over its port, only for what it was granted', async ({
  app,
  profile,
}) => {
  await app.evaluate(({ Notification }) => {
    const shown: string[] = [];
    Object.assign(globalThis, { pluginNotifications: shown });
    Notification.prototype.show = function show(this: Electron.Notification) {
      shown.push(`${this.title} / ${this.body}`);
    };
  });
  const network = { hosts: [] };
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['notifications:show'], network }),
    NOTIFIER,
  );
  await expect.poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 }).toBe('ok');
  const quiet = testManifest({ id: 'org.example.quiet', name: 'Quiet', capabilities: [], network });
  await installPlugin(app, profile, quiet, NOTIFIER);
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.quiet'))?.title, { timeout: 20_000 })
    .toBe('not-granted');
  expect(
    await app.evaluate(
      () => (globalThis as { pluginNotifications?: string[] }).pluginNotifications,
    ),
  ).toEqual(['Hello: Done / Your draft is ready.']);
  // The Plugins window shows both calls and how each went, never what they carried.
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  const activity = plugins.getByRole('region', { name: 'Recent activity' });
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

test('keeps each plugin’s secrets to itself', async ({ app, profile }) => {
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
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['secrets:own'], network }),
    keeper(true),
  );
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
    .toBe('sk-test');
  const other = testManifest({
    id: 'org.example.other',
    name: 'Other',
    capabilities: ['secrets:own'],
    network,
  });
  await installPlugin(app, profile, other, keeper(false));
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.other'))?.title, { timeout: 20_000 })
    .toBe('undefined');
  // What the file keeps is what the system's encryption made of the secret.
  const kept = await readFile(join(profile, 'plugins', '.secrets.json'), 'utf8');
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

test('keeps each plugin’s storage to itself, across restarts', async ({
  fakeWhatsApp,
  profile,
}) => {
  const network = { hosts: [] };
  const first = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await installPlugin(
      first,
      profile,
      testManifest({ capabilities: ['storage:local'], network }),
      counter(true),
    );
    await expect.poll(async () => (await pluginPage(first))?.title, { timeout: 20_000 }).toBe('1');
    const other = { id: 'org.example.other', name: 'Other', capabilities: ['storage:local'] };
    await installPlugin(first, profile, testManifest({ ...other, network }), counter(false));
    await expect
      .poll(async () => (await pluginPage(first, 'org.example.other'))?.title, { timeout: 20_000 })
      .toBe('0');
  } finally {
    await closeApp(first);
  }
  const second = await launchApp(fakeWhatsApp.origin, profile);
  try {
    await expect.poll(async () => (await pluginPage(second))?.title, { timeout: 20_000 }).toBe('2');
  } finally {
    await closeApp(second);
  }
  const kept = await readFile(
    join(profile, 'plugins', '.storage', 'org.example.hello.json'),
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

test('puts a plugin’s draft in the open chat’s message box, for the user to send', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['composer:insert-draft'], network: { hosts: [] } }),
    DRAFTER,
  );
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
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

test('stops a plugin’s calls as soon as the user takes the permission back', async ({
  app,
  profile,
}) => {
  await app.evaluate(({ Notification }) => {
    Notification.prototype.show = () => undefined;
  });
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['notifications:show'], network: { hosts: [] } }),
    PERSISTENT,
  );
  await expect.poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 }).toBe('ok');
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await plugins.getByText('Permissions').click();
  await plugins.getByRole('checkbox', { name: 'Show notifications' }).uncheck();
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('not-granted');
  await plugins.getByRole('checkbox', { name: 'Show notifications' }).check();
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('ok');
  await expect(plugins.getByRole('checkbox', { name: 'Show notifications' })).toBeChecked();
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

test('lists a plugin’s commands in the menu under its name, and runs the one the user picks', async ({
  app,
  profile,
}) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: { commands: [{ id: 'greet', title: 'Say hello' }] },
  });
  await installPlugin(app, profile, manifest, GREETER);
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
    .toBe('waiting');
  await expect.poll(() => runPluginCommand(app, 'Hello: Say hello')).toBe(true);
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('greeted');
  expect((await pluginPage(app))?.shown).toBe(false);
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

test('gives a plugin the settings the user chose in its form', async ({ app, profile }) => {
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
  await installPlugin(app, profile, manifest, CONFIGURED);
  await expect.poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 }).toBe('{}');
  await clickMenu(app, 'Plugins…');
  const plugins = await chromePage(app, '/plugins.html');
  await plugins.getByText('Settings').click();
  await plugins.getByLabel('Model').selectOption('large');
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('{"model":"large"}');
  await expect(plugins.getByLabel('Model')).toHaveValue('large');
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

test('adds a plugin’s items to right clicks on the message box, a message and a chat', async ({
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
  await installPlugin(app, profile, manifest, ACTOR);
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
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
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('fix');
  // macOS selects the word under the pointer, so Copy may come first.
  expect((await rightClick('message'))?.at(-1)).toBe('Hello: Explain');
  await clickLastItem(app);
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('explain');
  expect((await rightClick('chat'))?.at(-1)).toBe('Hello: Summarize');
  await clickLastItem(app);
  await expect.poll(async () => (await pluginPage(app))?.title).toBe('summarize');
});

/** A panel that says it loaded, and tries to retitle its window. */
const PANEL = `
document.body.textContent = 'Notes for this chat';
document.title = 'WhatsApp';
`;

test('opens a plugin’s panel in a window of its own, titled with the plugin’s name', async ({
  app,
  profile,
}) => {
  const manifest = testManifest({
    capabilities: [],
    network: { hosts: [] },
    contributes: { panel: { title: 'Notes', entry: 'panel.js' } },
  });
  await installPlugin(app, profile, manifest, 'export default { activate() {} };', {
    'panel.js': PANEL,
  });
  const open = () =>
    app.evaluate(({ Menu }) => {
      const plugins = Menu.getApplicationMenu()
        ?.items.flatMap((menu) => menu.submenu?.items ?? [])
        .find((entry) => entry.label === 'Plugin Commands');
      const panel = plugins?.submenu?.items.find((entry) => entry.label === 'Hello: Notes');
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

test('reads the open chat for a plugin allowed to, as plain data', async ({
  app,
  profile,
  window,
}) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await installPlugin(
    app,
    profile,
    testManifest({ capabilities: ['chat:read-active'], network: { hosts: [] } }),
    READER,
  );
  // Until the plugin writes its title, the page is titled with its address.
  const read = async () => {
    try {
      return JSON.parse((await pluginPage(app))?.title ?? 'null') as unknown;
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

/** Asks a server on this computer for a page, and writes in its title whether it got through. */
const LOCAL = `
export default {
  async activate() {
    try {
      // No CORS headers here, so the answer is opaque; getting one at all is what counts.
      await fetch('__LOCAL__', { mode: 'no-cors' });
      document.title = 'reached';
    } catch {
      document.title = 'blocked';
    }
  },
};
`;

test('lets a plugin reach a server on this computer only with local-network', async ({
  app,
  fakeWhatsApp,
  profile,
}) => {
  const local = LOCAL.replace('__LOCAL__', `${fakeWhatsApp.origin}/`);
  const network = { hosts: [] };
  await installPlugin(app, profile, testManifest({ capabilities: [], network }), local);
  await expect
    .poll(async () => (await pluginPage(app))?.title, { timeout: 20_000 })
    .toBe('blocked');
  const granted = testManifest({
    id: 'org.example.local',
    name: 'Local',
    capabilities: ['local-network'],
    network,
  });
  await installPlugin(app, profile, granted, local);
  await expect
    .poll(async () => (await pluginPage(app, 'org.example.local'))?.title, { timeout: 20_000 })
    .toBe('reached');
  expect((await pluginPage(app))?.title).toBe('blocked');
});

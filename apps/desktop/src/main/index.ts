import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  MessageChannelMain,
  Tray,
  globalShortcut,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { writeTextAtomically } from './atomic-write.ts';
import { createCustomCode } from './custom-code/custom-code.ts';
import { PLUGIN_PORT_CHANNEL } from '../shared/plugin-rpc.ts';
import { hostMethods } from './plugins/host-methods.ts';
import { RPC_OPTIONS } from './plugins/rpc.ts';
import { auditFileAt, createAuditLog } from './plugins/audit-log.ts';
import { homedir, release } from 'node:os';
import { join } from 'node:path';
import { createDownloadList } from './downloads/download-list.ts';
import { downloadsFolder } from './downloads/downloads.ts';
import { lastFolderIn } from './downloads/last-folder.ts';
import { openSecretStore, secretFileAt } from './secrets/secret-store.ts';
import { readInstallChannel } from './about/about-info.ts';
import { loadAccounts, saveAccounts } from './accounts/accounts-file.ts';
import { applyAutostart, chooseAutostart } from './autostart/autostart.ts';
import { xdgAutostart } from './autostart/xdg-autostart.ts';
import { CHROME_PARTITION, createChromeFeature } from './chrome/feature.ts';
import { profileCrashFiles, readPreviousLog } from './crash/crash-files.ts';
import { reviewCrashWithDialog } from './crash-review-prompt.ts';
import electronUpdater from 'electron-updater';
import trayIcon from '../../build/icons/32x32.png?asset';
import { PRODUCT_NAME } from './identity.ts';
import { createLogger } from './logging/logger.ts';
import { logProcessErrors } from './process-errors.ts';
import { askToInstallUpdateWithDialog } from './update-prompt.ts';
import { readInstallEvidence } from './updates/install-evidence.ts';
import { releaseFetcher } from './updates/update-notice.ts';
import { decideUpdatePolicy, settingsIgnoredBy } from './updates/update-policy.ts';
import { chooseFolder, electronSettingsFiles } from './settings/transfer-dialogs.ts';
import { openSettings } from './settings/service.ts';
import { electronCapture } from './permissions/electron-capture.ts';
import { askMediaWithDialog } from './permissions/media-prompt.ts';
import { sandboxDisabled } from './sandbox-check.ts';
import { confirmResetWithDialog } from './session-reset-prompt.ts';
import { confirmRemoveAccountWithDialog } from './account-removal-prompt.ts';
import { explainUnsafeStartWithDialog } from './unsafe-start-prompt.ts';
import { startApp } from './start.ts';
import { anchorFingerprints, TRUST_ANCHORS } from '@yapyap/plugin-sign';
import { electronPluginDialogs } from './plugins/plugin-dialogs.ts';
import { trayImage } from './tray/tray-icon.ts';
import { createAccountHost, createSecureWindow, createSidebarView } from './windows.ts';

const PICKER_THUMBNAIL = { width: 320, height: 180 };

const GPU_CRASH_LOG = join(app.getPath('userData'), 'gpu-crashes.json');
const WINDOW_STATE = join(app.getPath('userData'), 'window-state.json');
const DOWNLOADS_STATE = join(app.getPath('userData'), 'downloads.json');
// Kept apart from settings, so importing a settings file can never bring code that runs in WhatsApp.
const CUSTOM_CODE = join(app.getPath('userData'), 'custom-code.json');

// Holds the tray for the app's lifetime; a collected Tray disappears from the panel.
let tray: Tray | undefined;

const LOG_DIR = join(app.getPath('userData'), 'logs');

const logger = createLogger({
  dir: LOG_DIR,
  home: app.getPath('home'),
  now: Date.now,
  // Terminal output is redacted like the file, for people who start YapYap from one.
  mirror: (line) => process.stderr.write(`${line}\n`),
});

logProcessErrors(process, (message) => {
  logger.log('error', message);
});

const warn = (message: string): void => {
  logger.log('warn', message);
};

const notify = (body: string): void => {
  new Notification({ title: PRODUCT_NAME, body }).show();
};

const settings = openSettings(app.getPath('userData'), Date.now(), warn);

const installChannel = (): string =>
  readInstallChannel(() => readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));

const installEvidence = () =>
  readInstallEvidence({
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    // The executable sits in YapYap.app/Contents/MacOS.
    codesign: () =>
      spawnSync('/usr/bin/codesign', ['-dv', join(process.execPath, '..', '..', '..')], {
        encoding: 'utf8',
      }).stderr,
  });

const updatePolicy = decideUpdatePolicy(installChannel(), installEvidence()).policy;

const autostart = chooseAutostart({
  platform: process.platform,
  flatpak: existsSync('/.flatpak-info'),
  loginItems: app,
  xdg: () =>
    xdgAutostart({
      env: process.env,
      home: homedir(),
      execPath: process.execPath,
      files: {
        exists: existsSync,
        mkdir: (path) => {
          mkdirSync(path, { recursive: true });
        },
        write: (path, text) => {
          writeFileSync(path, text);
        },
        remove: (path) => {
          rmSync(path);
        },
      },
    }),
});

/** Shared by the download handling and the Downloads window. */
const downloadList = createDownloadList((path) => {
  shell.showItemInFolder(path);
});

const customCode = createCustomCode(
  {
    read: () => readFileSync(CUSTOM_CODE, 'utf8'),
    write: (text) => {
      writeTextAtomically(CUSTOM_CODE, text);
    },
  },
  warn,
);

// Plugins' secrets live apart from YapYap's own, so no mistake in a plugin's namespace reaches them (#96).
const pluginSecrets = openSecretStore(
  secretFileAt(join(app.getPath('userData'), 'plugins', '.secrets.json')),
  safeStorage,
  process.platform,
);

const chrome = createChromeFeature({
  notify,
  customCode,
  settings,
  chooseFolder,
  installEvidence,
  settingEffects: { 'general.autostart': applyAutostart(autostart, warn) },
  hiddenSettings: settingsIgnoredBy(updatePolicy),
  registerSchemesAsPrivileged: (schemes) => {
    protocol.registerSchemesAsPrivileged([...schemes]);
  },
  chromeProtocol: () => session.fromPartition(CHROME_PARTITION).protocol,
  ipc: ipcMain,
  createWindow: (options, renderer) => createSecureWindow(options, renderer),
  setMenu: (template) => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  },
  writeClipboard: (text) => clipboard.writeText(text),
  openExternal: (url) => shell.openExternal(url),
  facts: () => ({
    version: app.getVersion(),
    channel: installChannel(),
    versions: process.versions,
    platform: process.platform,
    release: release(),
    arch: process.arch,
  }),
  platform: process.platform,
  rendererRoot: join(import.meta.dirname, '..', 'renderer'),
  preloadPath: join(import.meta.dirname, '..', 'preload', 'chrome.cjs'),
  readFile: (path) => readFile(path),
  // Electron types the status as a fixed interface of string fields.
  gpuStatus: () => app.getGPUFeatureStatus() as unknown as Record<string, string>,
  recentLog: () => logger.recent(),
  settingsFiles: electronSettingsFiles,
  spelling: {
    available: () => session.defaultSession.availableSpellCheckerLanguages,
    system: () => app.getPreferredSystemLanguages(),
  },
  plugins: {
    ...electronPluginDialogs,
    root: join(app.getPath('userData'), 'plugins'),
    anchors: anchorFingerprints(TRUST_ANCHORS),
    sessionOf: (partition) => session.fromPartition(partition),
    // A plugin has no window of its own to show; its UI is YapYap's (ADR 0004).
    createHost: (partition) => {
      const host = createSecureWindow(
        { show: false, skipTaskbar: true, focusable: false, paintWhenInitiallyHidden: false },
        { partition, preload: join(import.meta.dirname, '..', 'preload', 'plugin.cjs') },
      );
      return {
        webContents: host.webContents,
        loadURL: (url) => host.loadURL(url),
        destroy: () => {
          host.destroy();
        },
        openPort: () => {
          const { port1, port2 } = new MessageChannelMain();
          host.webContents.postMessage(PLUGIN_PORT_CHANNEL, null, [port2]);
          return port1;
        },
      };
    },
    methodsFor: (plugin) =>
      hostMethods(plugin, {
        notify: (heading, text) => {
          new Notification({ title: heading, body: text, icon: trayIcon }).show();
        },
        quiet: () => settings.current().general.doNotDisturb,
        secrets: pluginSecrets,
      }),
    limits: {
      metrics: () => app.getAppMetrics(),
      notify: (message) => {
        new Notification({ title: PRODUCT_NAME, body: message, icon: trayIcon }).show();
      },
      every: (callback, ms) => setInterval(callback, ms),
      now: Date.now,
    },
    audit: createAuditLog(
      auditFileAt(join(app.getPath('userData'), 'plugins', 'audit.log')),
      () => new Date(),
      warn,
    ),
    rpc: {
      ...RPC_OPTIONS,
      now: Date.now,
      after: (ms, callback) => {
        setTimeout(callback, ms);
      },
    },
  },
  restart: () => {
    app.relaunch();
    app.quit();
  },
  confirmReset: confirmResetWithDialog,
  confirmRemoveAccount: confirmRemoveAccountWithDialog,
  captureSources: (kind) =>
    desktopCapturer.getSources({ types: [kind], thumbnailSize: PICKER_THUMBNAIL }),
  // The picker's owner is a web contents Electron itself handed to the capture handler.
  windowOf: (contents) => BrowserWindow.fromWebContents(contents as WebContents),
  downloads: downloadList,
  isGlobalShortcutRegistered: (accelerator) => globalShortcut.isRegistered(accelerator),
});

// No top-level await: test harnesses hold back the `ready` event until the
// entry module has finished evaluating.
startApp({
  app,
  autostart,
  chrome,
  settings,
  nativeTheme,
  notify,
  warn,
  customCode,
  createWindow: (options) => createSecureWindow(options),
  createAccountHost: (window, renderer) => createAccountHost(window, renderer),
  createSidebar: (window, renderer) => createSidebarView(window, renderer),
  defaultSession: () => session.defaultSession,
  sessionOf: (partition) => session.fromPartition(partition),
  accounts: loadAccounts(app.getPath('userData')),
  whatsAppPreload: join(import.meta.dirname, '..', 'preload', 'whatsapp.cjs'),
  notifications: {
    create: (options) => new Notification({ ...options, icon: trayIcon }),
    isSupported: () => Notification.isSupported(),
  },
  ipc: ipcMain,
  saveAccounts: (accounts) => {
    saveAccounts(app.getPath('userData'), accounts);
  },
  newAccountId: randomUUID,
  askMedia: askMediaWithDialog,
  capture: (pickInApp, wayland) =>
    electronCapture(process.platform, wayland, process.getSystemVersion(), pickInApp),
  chromeVersion: process.versions.chrome,
  platform: process.platform,
  env: process.env,
  argv: process.argv,
  openExternal: (url) => shell.openExternal(url),
  isOnline: () => net.isOnline(),
  gpuCrashLog: {
    read: () => readFileSync(GPU_CRASH_LOG, 'utf8'),
    write: (text) => {
      writeFileSync(GPU_CRASH_LOG, text);
    },
  },
  appMetrics: () => app.getAppMetrics(),
  idleSeconds: () => powerMonitor.getSystemIdleTime(),
  globalShortcuts: globalShortcut,
  systemLanguages: () => app.getPreferredSystemLanguages(),
  contextMenu: (items) => {
    Menu.buildFromTemplate(items).popup();
  },
  secrets: openSecretStore(
    secretFileAt(join(app.getPath('userData'), 'secrets.json')),
    safeStorage,
    process.platform,
  ),
  onResume: (listener) => {
    powerMonitor.on('resume', listener);
  },
  windowState: {
    read: () => readFileSync(WINDOW_STATE, 'utf8'),
    write: (text) => {
      writeFileSync(WINDOW_STATE, text);
    },
  },
  workAreas: () => screen.getAllDisplays().map((display) => display.workArea),
  downloads: {
    folder: () =>
      downloadsFolder(settings.current().downloads.folder, () => app.getPath('downloads'), {
        realpath: (path) => realpathSync(path),
        isFolder: (path) => statSync(path).isDirectory(),
      }),
    taken: (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined,
    lastFolder: lastFolderIn({
      read: () => readFileSync(DOWNLOADS_STATE, 'utf8'),
      write: (text) => {
        writeFileSync(DOWNLOADS_STATE, text);
      },
    }),
    openPath: (path) => shell.openPath(path),
    track: downloadList.add,
  },
  shutdown: {
    onSignal: (signal, listener) => {
      process.on(signal, listener);
    },
    onSystemShutdown: (listener) => {
      powerMonitor.on('shutdown', listener);
    },
  },
  sandboxDisabled: sandboxDisabled(app.commandLine, process.env),
  explainUnsafeStart: explainUnsafeStartWithDialog,
  selfUpdate: {
    updater: () => electronUpdater.autoUpdater,
    askToInstall: askToInstallUpdateWithDialog,
  },
  badge: {
    setBadgeCount: (count) => app.setBadgeCount(count),
    createImage: ({ bitmap, width, height, scaleFactor }) =>
      nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor }),
  },
  tray: {
    create: () => {
      tray = new Tray(trayIcon);
      return tray;
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    image: (choice) =>
      trayImage(
        choice,
        {
          fromPath: (path) => nativeImage.createFromPath(path),
          fromBitmap: (bitmap, size) => nativeImage.createFromBitmap(bitmap, size),
        },
        trayIcon,
      ),
    scheme: nativeTheme,
  },
  releases: {
    policy: updatePolicy,
    currentVersion: app.getVersion(),
    fetchJson: releaseFetcher((url, init) => net.fetch(url, init)),
    showNotice: (body, url) => {
      const notice = new Notification({ title: PRODUCT_NAME, body });
      notice.on('click', () => {
        void shell.openExternal(url);
      });
      notice.show();
    },
  },
  crashes: {
    files: profileCrashFiles(app.getPath('userData')),
    version: app.getVersion(),
    previousLog: () => readPreviousLog(LOG_DIR),
    review: reviewCrashWithDialog,
    writeClipboard: (text) => clipboard.writeText(text),
  },
  logError: (message) => {
    logger.log('error', message);
  },
}).catch((error: unknown) => {
  logger.log('error', `Startup failed: ${String(error)}`);
  app.exit(1);
});

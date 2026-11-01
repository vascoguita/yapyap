// Generated from locales/en.json by scripts/src/bin/i18n-types.ts;
// change the catalog and run it again rather than editing this file.

/** The shape every message catalog has, from the English source (ADR 0012). */
export interface Messages {
  readonly common: {
    readonly loading: string;
    readonly cancel: string;
    readonly close: string;
    readonly discard: string;
    readonly keepEditing: string;
  };
  readonly about: {
    readonly title: string;
    readonly details: {
      readonly version: string;
      readonly operatingSystem: string;
      readonly graphics: string;
      readonly license: string;
    };
    readonly versionValue: (params: {
      readonly channel: string | number;
      readonly version: string | number;
    }) => string;
    readonly unavailable: string;
    readonly copyDetails: string;
    readonly copied: string;
    readonly copyFailed: string;
    readonly linksLabel: string;
    readonly links: {
      readonly website: string;
      readonly source: string;
      readonly issues: string;
      readonly privacy: string;
      readonly sponsor: string;
    };
    readonly supportedBy: string;
    readonly disclaimer: string;
  };
  readonly newChat: {
    readonly title: string;
    readonly numberLabel: string;
    readonly numberPlaceholder: string;
    readonly numberHint: string;
    readonly notReady: string;
    readonly open: string;
  };
  readonly picker: {
    readonly title: string;
    readonly screens: string;
    readonly windows: string;
    readonly noSources: string;
    readonly nothing: string;
    readonly audio: string;
    readonly share: string;
  };
  readonly recovery: {
    readonly problems: {
      readonly unsupported: { readonly title: string; readonly advice: string };
      readonly blank: { readonly title: string; readonly advice: string };
      readonly 'load-failed': { readonly title: string; readonly advice: string };
      readonly crashed: { readonly title: string; readonly advice: string };
    };
    readonly failed: string;
    readonly retry: string;
    readonly retrying: string;
    readonly clearCache: string;
    readonly cacheCleared: string;
    readonly copyDiagnostics: string;
    readonly diagnosticsCopied: string;
    readonly diagnosticsNotCopied: string;
    readonly keepsLogin: string;
  };
  readonly settings: {
    readonly title: string;
    readonly sectionsLabel: string;
    readonly unavailable: string;
    readonly restartNeeded: string;
    readonly restartNow: string;
    readonly restartNote: string;
    readonly waylandPlacement: string;
    readonly saveFailed: string;
    readonly scale: (params: { readonly percent: string | number }) => string;
    readonly proxyPlaceholder: string;
    readonly defaultFolder: string;
    readonly chooseFolder: string;
    readonly useDefaultFolder: string;
    readonly defaultRecordingFolder: string;
    readonly useDefaultRecordingFolder: string;
    readonly sections: {
      readonly assistant: string;
      readonly general: string;
      readonly spelling: string;
      readonly appearance: string;
      readonly reliability: string;
      readonly downloads: string;
      readonly recording: string;
      readonly privacy: string;
      readonly network: string;
      readonly extensions: string;
    };
    readonly backup: {
      readonly title: string;
      readonly hint: string;
      readonly export: string;
      readonly import: string;
      readonly failed: string;
      readonly fileType: string;
      readonly exported: string;
      readonly exportFailed: string;
      readonly readFailed: string;
      readonly notSettings: string;
      readonly damaged: string;
      readonly confirm: string;
      readonly confirmButton: string;
      readonly replaces: string;
      readonly invalidValues: (params: { readonly count: number }) => string;
      readonly imported: string;
    };
    readonly loadNotices: {
      readonly restored: string;
      readonly defaults: string;
      readonly reset: string;
    };
    readonly problems: { readonly autostartFailed: string };
    readonly autostartReason: string;
    readonly fields: {
      readonly assistant: {
        readonly enabled: { readonly label: string; readonly description: string };
        readonly provider: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly auto: string;
            readonly 'built-in': string;
            readonly anthropic: string;
            readonly openai: string;
            readonly local: string;
          };
        };
        readonly model: { readonly label: string; readonly description: string };
        readonly autoSuggest: { readonly label: string; readonly description: string };
        readonly messages: {
          readonly label: string;
          readonly description: string;
          readonly options: { readonly '5': string; readonly '10': string; readonly '20': string };
        };
        readonly localServer: { readonly label: string; readonly description: string };
      };
      readonly general: {
        readonly startMinimized: { readonly label: string; readonly description: string };
        readonly autostart: { readonly label: string; readonly description: string };
        readonly betaUpdates: { readonly label: string; readonly description: string };
        readonly doNotDisturb: { readonly label: string; readonly description: string };
        readonly quickPanel: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly off: string;
            readonly always: string;
            readonly whenHidden: string;
          };
        };
        readonly quickPanelPlace: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly free: string;
            readonly topLeft: string;
            readonly topRight: string;
            readonly bottomLeft: string;
            readonly bottomRight: string;
          };
        };
        readonly closeToTray: { readonly label: string; readonly description: string };
      };
      readonly spelling: {
        readonly enabled: { readonly label: string; readonly description: string };
      };
      readonly appearance: {
        readonly theme: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly system: string;
            readonly light: string;
            readonly dark: string;
          };
        };
        readonly autoHideMenuBar: { readonly label: string; readonly description: string };
        readonly trayIcon: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly color: string;
            readonly auto: string;
            readonly light: string;
            readonly dark: string;
          };
        };
        readonly zoom: { readonly label: string; readonly description: string };
        readonly pinchZoom: { readonly label: string; readonly description: string };
        readonly compactSidebar: { readonly label: string; readonly description: string };
      };
      readonly reliability: {
        readonly hardwareAcceleration: { readonly label: string; readonly description: string };
        readonly displayBackend: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly auto: string;
            readonly wayland: string;
            readonly x11: string;
          };
        };
        readonly diskCacheMb: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly '128': string;
            readonly '256': string;
            readonly '512': string;
            readonly '1024': string;
            readonly auto: string;
          };
        };
        readonly jsHeapMb: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly '2048': string;
            readonly '4096': string;
            readonly '8192': string;
            readonly auto: string;
          };
        };
        readonly hardwareVideoDecoding: { readonly label: string; readonly description: string };
      };
      readonly privacy: {
        readonly crashReports: {
          readonly label: string;
          readonly description: string;
          readonly options: { readonly off: string; readonly local: string; readonly ask: string };
        };
        readonly notificationSender: { readonly label: string; readonly description: string };
        readonly notificationText: { readonly label: string; readonly description: string };
        readonly blurWhenUnfocused: { readonly label: string; readonly description: string };
        readonly blurWhenIdle: { readonly label: string; readonly description: string };
        readonly unreadWhileHidden: { readonly label: string; readonly description: string };
      };
      readonly network: {
        readonly proxyMode: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly system: string;
            readonly direct: string;
            readonly manual: string;
          };
        };
        readonly proxyServer: { readonly label: string; readonly description: string };
      };
      readonly extensions: {
        readonly developerMode: { readonly label: string; readonly description: string };
        readonly chatMessages: {
          readonly label: string;
          readonly description: string;
          readonly options: {
            readonly '5': string;
            readonly '10': string;
            readonly '20': string;
            readonly '50': string;
          };
        };
      };
      readonly downloads: {
        readonly askWhere: { readonly label: string; readonly description: string };
        readonly folder: { readonly label: string; readonly description: string };
        readonly openWhenDone: { readonly label: string; readonly description: string };
      };
      readonly recording: {
        readonly format: {
          readonly label: string;
          readonly description: string;
          readonly options: { readonly webm: string; readonly wav: string };
        };
        readonly folder: { readonly label: string; readonly description: string };
      };
    };
  };
  readonly welcome: {
    readonly title: string;
    readonly intro: string;
    readonly guide: string;
    readonly language: string;
    readonly languageNote: string;
    readonly look: string;
    readonly closing: string;
    readonly notifications: string;
    readonly notificationsNote: string;
    readonly start: string;
  };
  readonly trace: {
    readonly confirm: string;
    readonly confirmDetail: string;
    readonly choose: string;
    readonly saved: string;
    readonly savedDetail: string;
    readonly failed: string;
    readonly failedDetail: string;
  };
  readonly report: {
    readonly issueTitle: string;
    readonly crashTitle: string;
    readonly crashTitleWith: (params: { readonly fingerprint: string | number }) => string;
    readonly crashWhatHappened: string;
    readonly title: string;
    readonly intro: string;
    readonly description: string;
    readonly placeholder: string;
    readonly diagnostics: string;
    readonly diagnosticsHint: string;
    readonly open: string;
    readonly opened: string;
    readonly failed: string;
    readonly discard: string;
  };
  readonly accounts: {
    readonly defaultName: string;
    readonly numberedName: (params: { readonly position: string | number }) => string;
    readonly title: string;
    readonly hint: string;
    readonly listLabel: string;
    readonly off: string;
    readonly shown: string;
    readonly name: string;
    readonly color: string;
    readonly colors: {
      readonly green: string;
      readonly blue: string;
      readonly purple: string;
      readonly orange: string;
      readonly red: string;
      readonly teal: string;
    };
    readonly mute: string;
    readonly muteHint: string;
    readonly muted: string;
    readonly run: string;
    readonly runHint: string;
    readonly proxy: string;
    readonly proxyPlaceholder: string;
    readonly proxyHint: string;
    readonly proxyInvalid: string;
    readonly save: string;
    readonly remove: string;
    readonly refused: string;
    readonly removeRefused: string;
    readonly failed: string;
    readonly unavailable: string;
    readonly permissions: {
      readonly title: string;
      readonly camera: string;
      readonly microphone: string;
      readonly notifications: string;
      readonly screen: string;
      readonly allowed: string;
      readonly asks: string;
      readonly notificationsState: string;
      readonly screenState: string;
      readonly forget: string;
    };
    readonly discard: string;
  };
  readonly sidebar: {
    readonly label: string;
    readonly muted: string;
    readonly unread: (params: { readonly count: number }) => string;
    readonly badgeOverflow: (params: { readonly max: string | number }) => string;
    readonly compact: string;
    readonly sharing: string;
    readonly stopSharing: (params: { readonly name: string | number }) => string;
    readonly full: string;
    readonly doNotDisturb: string;
  };
  readonly assistant: {
    readonly privateModel: (params: { readonly name: string | number }) => string;
    readonly providers: {
      readonly 'built-in': string;
      readonly anthropic: string;
      readonly openai: string;
      readonly local: string;
    };
    readonly providerTitles: {
      readonly 'built-in': string;
      readonly anthropic: string;
      readonly openai: string;
      readonly local: string;
    };
    readonly settings: {
      readonly intro: string;
      readonly where: string;
      readonly whereHint: string;
      readonly inUse: string;
      readonly automatic: string;
      readonly private: {
        readonly title: string;
        readonly description: (params: { readonly size: string | number }) => string;
        readonly download: string;
        readonly pause: string;
        readonly resume: string;
        readonly remove: string;
        readonly smaller: string;
        readonly none: string;
        readonly downloading: (params: {
          readonly done: string | number;
          readonly percent: string | number;
          readonly size: string | number;
        }) => string;
        readonly paused: (params: { readonly percent: string | number }) => string;
        readonly failed: (params: { readonly percent: string | number }) => string;
        readonly diskFull: (params: { readonly size: string | number }) => string;
        readonly damaged: string;
        readonly ready: (params: { readonly size: string | number }) => string;
        readonly outOfMemory: string;
        readonly outOfMemorySmall: string;
      };
      readonly anthropic: {
        readonly title: string;
        readonly description: string;
        readonly getKey: string;
      };
      readonly openai: {
        readonly title: string;
        readonly description: string;
        readonly getKey: string;
      };
      readonly key: {
        readonly label: (params: { readonly provider: string | number }) => string;
        readonly placeholder: string;
        readonly save: string;
        readonly forget: string;
        readonly test: string;
        readonly saved: string;
        readonly none: string;
        readonly testing: string;
        readonly works: string;
        readonly cannotKeep: string;
        readonly empty: string;
      };
      readonly local: {
        readonly title: string;
        readonly description: string;
        readonly find: string;
        readonly finding: string;
        readonly none: string;
        readonly found: (params: {
          readonly models: string | number;
          readonly server: string | number;
        }) => string;
        readonly use: string;
        readonly noModels: string;
        readonly address: string;
        readonly addressPlaceholder: string;
        readonly saveAddress: string;
        readonly badAddress: string;
        readonly current: (params: { readonly server: string | number }) => string;
      };
      readonly model: {
        readonly auto: string;
        readonly autoNamed: (params: { readonly model: string | number }) => string;
        readonly notReady: string;
        readonly none: string;
      };
      readonly behavior: string;
      readonly privacy: {
        readonly title: string;
        readonly what: string;
        readonly where: {
          readonly 'built-in': string;
          readonly local: string;
          readonly anthropic: string;
          readonly openai: string;
          readonly none: string;
        };
        readonly chats: string;
        readonly chatsHint: string;
        readonly noChats: string;
        readonly unnamed: string;
        readonly remove: string;
        readonly removeLabel: (params: { readonly chat: string | number }) => string;
        readonly chat: (params: {
          readonly account: string | number;
          readonly chat: string | number;
        }) => string;
      };
      readonly shortcuts: string;
      readonly unavailable: string;
    };
    readonly bar: {
      readonly label: string;
      readonly name: string;
      readonly suggest: string;
      readonly summarize: string;
      readonly rewrite: string;
      readonly rewriteLabel: string;
      readonly styles: {
        readonly friendlier: string;
        readonly formal: string;
        readonly shorter: string;
      };
      readonly translate: (params: { readonly language: string | number }) => string;
      readonly catchUp: string;
      readonly catchUpLabel: string;
      readonly write: string;
      readonly writePlaceholder: string;
      readonly use: string;
      readonly sendLabel: string;
      readonly model: string;
      readonly settings: string;
      readonly copy: string;
      readonly close: string;
      readonly useRewrite: string;
      readonly allow: string;
      readonly whatSent: string;
      readonly send: string;
      readonly setUp: string;
      readonly pasteKey: string;
      readonly resume: string;
      readonly smaller: string;
      readonly openSettings: string;
    };
    readonly status: {
      readonly noChat: string;
      readonly chatChanged: string;
      readonly thinking: string;
      readonly copied: string;
      readonly consent: (params: { readonly provider: string | number }) => string;
      readonly consentPrivate: string;
      readonly preview: string;
      readonly catchUp: string;
      readonly nothing: string;
      readonly emptyDraft: string;
      readonly noUnread: string;
      readonly setUp: string;
      readonly key: (params: { readonly provider: string | number }) => string;
      readonly download: string;
      readonly noModel: (params: { readonly provider: string | number }) => string;
      readonly localServer: string;
      readonly openChat: string;
      readonly off: string;
    };
    readonly problems: {
      readonly auth: (params: { readonly provider: string | number }) => string;
      readonly rateLimited: (params: { readonly provider: string | number }) => string;
      readonly network: (params: { readonly provider: string | number }) => string;
      readonly timeout: (params: { readonly provider: string | number }) => string;
      readonly refused: string;
      readonly badRequest: (params: { readonly provider: string | number }) => string;
      readonly cancelled: string;
      readonly outOfMemory: string;
      readonly failed: string;
    };
    readonly welcome: {
      readonly title: string;
      readonly intro: string;
      readonly local: (params: { readonly server: string | number }) => string;
      readonly localHint: string;
      readonly private: (params: { readonly size: string | number }) => string;
      readonly privateHint: string;
      readonly anthropic: string;
      readonly openai: string;
      readonly keyHint: string;
      readonly later: string;
      readonly laterHint: string;
      readonly done: string;
    };
  };
  readonly chatList: { readonly label: string; readonly hint: string };
  readonly extensions: {
    readonly notificationTitle: (params: {
      readonly extension: string | number;
      readonly title: string | number;
    }) => string;
    readonly stopped: (params: { readonly extension: string | number }) => string;
    readonly title: string;
    readonly hint: string;
    readonly listFailed: string;
    readonly changeFailed: string;
    readonly empty: string;
    readonly browse: string;
    readonly fileType: string;
    readonly version: (params: { readonly version: string | number }) => string;
    readonly trust: {
      readonly 'first-party': string;
      readonly 'third-party': string;
      readonly developer: string;
    };
    readonly pulled: (params: { readonly reason: string | number }) => string;
    readonly developerMode: string;
    readonly result: {
      readonly installed: (params: {
        readonly name: string | number;
        readonly version: string | number;
      }) => string;
      readonly rejected: string;
      readonly failed: string;
    };
    readonly reason: {
      readonly unreadable: string;
      readonly manifestInvalid: (params: { readonly problem: string | number }) => string;
      readonly missingFile: (params: { readonly file: string | number }) => string;
      readonly developerModeOnly: string;
      readonly firstPartyName: string;
      readonly updateUnsigned: string;
    };
    readonly consent: {
      readonly install: (params: { readonly name: string | number }) => string;
      readonly update: (params: {
        readonly name: string | number;
        readonly version: string | number;
      }) => string;
      readonly author: (params: { readonly name: string | number }) => string;
      readonly key: string;
      readonly unsigned: string;
      readonly firstParty: string;
      readonly asks: string;
      readonly updateAsks: string;
      readonly added: string;
      readonly hosts: string;
      readonly nothing: string;
      readonly risk: string;
      readonly marketplaceRisk: (params: { readonly host: string | number }) => string;
      readonly unsignedRisk: string;
      readonly acknowledge: string;
      readonly confirmInstall: string;
      readonly confirmUpdate: string;
    };
    readonly settings: string;
    readonly remove: string;
    readonly removeLabel: (params: { readonly extension: string | number }) => string;
    readonly settingDefault: string;
    readonly settingSaved: string;
    readonly settingRefused: string;
    readonly permissions: string;
    readonly permissionsHint: string;
    readonly connectTo: (params: { readonly host: string | number }) => string;
    readonly capabilities: {
      readonly 'chat:read-active': string;
      readonly 'chat:read-unread-summary': string;
      readonly 'composer:insert-draft': string;
      readonly 'local-network': string;
      readonly 'composer:read-draft': string;
      readonly 'notifications:show': string;
      readonly 'storage:local': string;
      readonly 'secrets:own': string;
      readonly 'calls:record': string;
    };
    readonly activity: {
      readonly title: string;
      readonly hint: string;
      readonly empty: string;
      readonly outcomes: {
        readonly ok: string;
        readonly invalid: string;
        readonly 'not-granted': string;
        readonly 'rate-limited': string;
        readonly timeout: string;
        readonly failed: string;
      };
    };
    readonly marketplace: {
      readonly installedTab: string;
      readonly marketplaceTab: string;
      readonly tabsLabel: string;
      readonly search: string;
      readonly loading: string;
      readonly unreachable: string;
      readonly invalid: string;
      readonly outdated: string;
      readonly retry: string;
      readonly empty: string;
      readonly from: (params: { readonly host: string | number }) => string;
      readonly by: (params: { readonly name: string | number }) => string;
      readonly version: (params: { readonly version: string | number }) => string;
      readonly install: string;
      readonly installLabel: (params: { readonly extension: string | number }) => string;
      readonly update: (params: { readonly version: string | number }) => string;
      readonly updateLabel: (params: {
        readonly extension: string | number;
        readonly version: string | number;
      }) => string;
      readonly installed: string;
      readonly incompatible: string;
      readonly whatsNew: (params: { readonly version: string | number }) => string;
      readonly homepage: string;
      readonly privacy: string;
      readonly mismatch: string;
      readonly unlisted: string;
      readonly latestUnreachable: (params: { readonly host: string | number }) => string;
      readonly wrongKey: (params: { readonly host: string | number }) => string;
      readonly pulledLatest: (params: { readonly host: string | number }) => string;
      readonly noUpdate: (params: {
        readonly host: string | number;
        readonly version: string | number;
      }) => string;
    };
  };
  readonly notifications: {
    readonly titled: (params: {
      readonly account: string | number;
      readonly title: string | number;
    }) => string;
    readonly hiddenSender: string;
    readonly hiddenText: string;
    readonly replyPlaceholder: string;
  };
  readonly downloads: {
    readonly title: string;
    readonly empty: string;
    readonly progress: (params: {
      readonly received: string | number;
      readonly total: string | number;
    }) => string;
    readonly paused: (params: { readonly received: string | number }) => string;
    readonly completed: string;
    readonly cancelled: string;
    readonly interrupted: string;
    readonly pause: string;
    readonly resume: string;
    readonly cancel: string;
    readonly show: string;
    readonly clear: string;
    readonly actionLabel: (params: {
      readonly action: string | number;
      readonly file: string | number;
    }) => string;
    readonly kept: string;
  };
  readonly customCode: {
    readonly title: string;
    readonly warning: string;
    readonly enabled: string;
    readonly scope: string;
    readonly allAccounts: string;
    readonly css: string;
    readonly cssHint: string;
    readonly js: string;
    readonly jsHint: string;
    readonly save: string;
    readonly saved: string;
    readonly failed: string;
    readonly discard: string;
  };
  readonly shortcuts: {
    readonly global: string;
    readonly globalHint: string;
    readonly extensions: string;
    readonly extensionsHint: string;
    readonly none: string;
    readonly remove: string;
    readonly notRegistered: string;
    readonly change: string;
    readonly reset: string;
    readonly press: string;
    readonly invalid: string;
    readonly switchEndsInOne: string;
    readonly taken: (params: { readonly action: string | number }) => string;
    readonly title: string;
    readonly shortcut: string;
    readonly action: string;
    readonly actions: {
      readonly settings: string;
      readonly shortcuts: string;
      readonly switchAccount: string;
      readonly privacyScreen: string;
      readonly zoomIn: string;
      readonly zoomOut: string;
      readonly actualSize: string;
      readonly reload: string;
      readonly forceReload: string;
      readonly fullScreen: string;
      readonly devTools: string;
      readonly undo: string;
      readonly redo: string;
      readonly cut: string;
      readonly copy: string;
      readonly paste: string;
      readonly pastePlain: string;
      readonly selectAll: string;
      readonly minimize: string;
      readonly close: string;
      readonly downloads: string;
      readonly toggleWindow: string;
      readonly hide: string;
      readonly quit: string;
      readonly assistantSuggest: string;
      readonly assistantSummarize: string;
      readonly assistantCatchUp: string;
    };
  };
  readonly spellingLanguages: {
    readonly title: string;
    readonly search: string;
    readonly off: string;
    readonly download: string;
    readonly system: (params: { readonly names: string | number }) => string;
    readonly noSystem: string;
    readonly chosen: (params: { readonly count: number; readonly max: string | number }) => string;
    readonly useSystem: string;
    readonly noMatch: string;
    readonly macos: string;
  };
  readonly contextMenu: {
    readonly noSuggestions: string;
    readonly addToDictionary: string;
    readonly checkSpelling: string;
    readonly languages: string;
  };
  readonly proxyLogin: {
    readonly title: string;
    readonly asks: (params: { readonly host: string | number }) => string;
    readonly failed: string;
    readonly username: string;
    readonly password: string;
    readonly remember: string;
    readonly rememberHint: string;
    readonly cannotRemember: string;
    readonly signIn: string;
  };
  readonly badge: { readonly unread: (params: { readonly count: number }) => string };
  readonly tray: {
    readonly tooltip: string;
    readonly unread: (params: { readonly count: number }) => string;
    readonly show: string;
    readonly hide: string;
    readonly settings: string;
    readonly doNotDisturb: string;
    readonly privacyScreen: string;
    readonly sharing: string;
    readonly stopSharing: (params: { readonly account: string | number }) => string;
    readonly mutedAccount: (params: { readonly name: string | number }) => string;
    readonly quit: string;
  };
  readonly menu: {
    readonly file: string;
    readonly view: string;
    readonly account: string;
    readonly actualSize: string;
    readonly privacyScreen: string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly newChat: string;
    readonly clearCache: string;
    readonly resetSession: string;
    readonly addAccount: string;
    readonly manageAccounts: string;
    readonly extensions: string;
    readonly installExtension: string;
    readonly customCode: string;
    readonly extensionCommands: string;
    readonly extensionCommand: (params: {
      readonly extension: string | number;
      readonly title: string | number;
    }) => string;
    readonly removeAccount: string;
    readonly doNotDisturb: string;
    readonly muteAccount: string;
    readonly about: (params: { readonly product: string | number }) => string;
    readonly settings: string;
    readonly copyDiagnostics: string;
    readonly recordTrace: string;
    readonly shortcuts: string;
    readonly downloads: string;
    readonly edit: string;
    readonly window: string;
    readonly reportProblem: string;
    readonly assistant: string;
    readonly assistantSuggest: string;
    readonly assistantSummarize: string;
    readonly assistantCatchUp: string;
    readonly assistantSettings: string;
  };
  readonly windows: {
    readonly about: string;
    readonly settings: string;
    readonly picker: string;
    readonly newChat: string;
    readonly spellingLanguages: string;
    readonly accounts: string;
    readonly extensions: string;
    readonly shortcuts: string;
    readonly customCode: string;
    readonly quickPanel: string;
    readonly downloads: string;
    readonly extensionConsent: string;
    readonly welcome: string;
    readonly report: string;
    readonly proxyLogin: string;
    readonly offline: (params: { readonly pageTitle: string | number }) => string;
  };
  readonly dialogs: {
    readonly extensionHost: {
      readonly message: (params: {
        readonly extension: string | number;
        readonly host: string | number;
      }) => string;
      readonly detail: string;
      readonly allow: string;
      readonly deny: string;
    };
    readonly extensionLocalServer: {
      readonly message: (params: {
        readonly extension: string | number;
        readonly server: string | number;
      }) => string;
      readonly detail: string;
      readonly allow: string;
      readonly deny: string;
    };
    readonly removeExtension: {
      readonly message: (params: { readonly extension: string | number }) => string;
      readonly detail: string;
      readonly confirm: string;
    };
    readonly resetSession: {
      readonly message: string;
      readonly detail: string;
      readonly confirm: string;
    };
    readonly removeAccount: {
      readonly message: (params: { readonly name: string | number }) => string;
      readonly detail: string;
      readonly confirm: string;
    };
    readonly unsafeStart: {
      readonly message: string;
      readonly detail: string;
      readonly guide: string;
    };
    readonly crashReview: {
      readonly message: string;
      readonly detail: (params: { readonly report: string | number }) => string;
      readonly report: string;
      readonly copy: string;
    };
    readonly installUpdate: {
      readonly message: (params: { readonly version: string | number }) => string;
      readonly detail: string;
      readonly install: string;
      readonly later: string;
    };
    readonly media: {
      readonly devices: { readonly audio: string; readonly video: string };
      readonly request: (params: {
        readonly account: string | number;
        readonly devices: string | number;
      }) => string;
      readonly detail: string;
      readonly allow: string;
      readonly deny: string;
      readonly systemRefused: (params: { readonly device: string | number }) => string;
      readonly systemRefusedDetail: string;
    };
  };
  readonly notices: {
    readonly safeMode: string;
    readonly gpuCrashes: string;
    readonly whatsAppReloaded: string;
    readonly newRelease: (params: { readonly version: string | number }) => string;
    readonly downloaded: (params: { readonly name: string | number }) => string;
    readonly downloadFailed: (params: { readonly name: string | number }) => string;
    readonly saved: (params: { readonly name: string | number }) => string;
  };
  readonly recording: {
    readonly windowTitle: string;
    readonly asks: (params: { readonly extension: string | number }) => string;
    readonly consentHint: string;
    readonly record: string;
    readonly notNow: string;
    readonly recording: string;
    readonly stop: string;
    readonly saved: string;
    readonly consent: {
      readonly message: string;
      readonly detail: string;
      readonly checkbox: string;
    };
  };
}

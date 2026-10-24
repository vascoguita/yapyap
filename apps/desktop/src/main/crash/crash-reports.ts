import {
  buildCrashReport,
  CRASH_REPORT,
  crashIssueUrl,
  readSessionMarker,
  SESSION_MARKER,
  sessionMarker,
  type Session,
} from './crash-report.ts';

type CrashReportsSetting = 'off' | 'local' | 'ask';

export type CrashReviewChoice = 'report' | 'copy' | 'close';

/** Files in YapYap's profile folder, by name. */
export interface CrashFiles {
  /** Undefined when the file does not exist or cannot be read. */
  read(name: string): string | undefined;
  write(name: string, text: string): void;
  remove(name: string): void;
  /** When the file was last written, in milliseconds since the epoch; undefined when it is missing. */
  modifiedAt(name: string): number | undefined;
  /** Removes the memory dumps Chromium may have written, and returns how many. */
  clearDumps(): number;
}

/** A crash report older than this is no longer worth keeping. */
const REPORT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CrashReportDependencies {
  readonly files: CrashFiles;
  readonly version: string;
  readonly now: () => number;
  readonly setting: () => CrashReportsSetting;
  readonly onQuit: (listener: () => void) => void;
  readonly warn: (message: string) => void;
}

export interface CrashReviewDependencies {
  readonly technicalDetails: () => string;
  readonly previousLog: () => readonly string[];
  /** Shows the report and asks what to do with it. */
  readonly review: (report: string) => Promise<CrashReviewChoice>;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly writeClipboard: (text: string) => Promise<unknown>;
}

function attempt(run: () => void, warn: (message: string) => void, failure: string): void {
  try {
    run();
  } catch {
    warn(failure);
  }
}

async function offerReview(report: string, deps: CrashReviewDependencies): Promise<void> {
  const actions: Readonly<Record<CrashReviewChoice, () => Promise<unknown>>> = {
    report: () => deps.openExternal(crashIssueUrl(report)),
    copy: () => deps.writeClipboard(report),
    close: () => Promise.resolve(),
  };
  await actions[await deps.review(report)]();
}

function reportCrash(
  previous: Session,
  setting: CrashReportsSetting,
  deps: CrashReportDependencies,
): (review: CrashReviewDependencies) => Promise<void> {
  return async (review) => {
    const report = buildCrashReport(previous, review.technicalDetails(), review.previousLog());
    attempt(
      () => {
        deps.files.write(CRASH_REPORT, report);
      },
      deps.warn,
      'Could not save the crash report.',
    );
    if (setting === 'ask') {
      await offerReview(report, review);
    }
  };
}

/**
 * Keeps crash files bounded (#113): one report, for at most 30 days, and no
 * memory dumps, which could hold messages, whatever wrote them.
 */
function pruneCrashFiles(deps: CrashReportDependencies): void {
  attempt(
    () => {
      const saved = deps.files.modifiedAt(CRASH_REPORT);
      if (saved !== undefined && deps.now() - saved > REPORT_DAYS * DAY_MS) {
        deps.files.remove(CRASH_REPORT);
      }
      const dumps = deps.files.clearDumps();
      if (dumps > 0) {
        deps.warn(`Removed ${String(dumps)} crash dumps, which can hold messages.`);
      }
    },
    deps.warn,
    'Could not remove old crash files.',
  );
}

/**
 * Notices when the previous session did not quit cleanly. With crash reports
 * on, the returned function saves a local report once the app is ready and,
 * when the user asked for it, offers to review it. Nothing leaves the
 * computer unless the user opens the prefilled issue and submits it.
 */
export function trackCrashes(
  deps: CrashReportDependencies,
): (review: CrashReviewDependencies) => Promise<void> {
  pruneCrashFiles(deps);
  const previous = readSessionMarker(deps.files.read(SESSION_MARKER) ?? '');
  attempt(
    () => {
      deps.files.write(
        SESSION_MARKER,
        sessionMarker({ version: deps.version, startedAt: deps.now() }),
      );
    },
    deps.warn,
    'Could not record that YapYap is running.',
  );
  deps.onQuit(() => {
    attempt(
      () => {
        deps.files.remove(SESSION_MARKER);
      },
      deps.warn,
      'Could not record that YapYap quit cleanly.',
    );
  });
  const setting = deps.setting();
  if (previous === undefined || setting === 'off') {
    return () => Promise.resolve();
  }
  deps.warn('The previous session did not end cleanly.');
  return reportCrash(previous, setting, deps);
}

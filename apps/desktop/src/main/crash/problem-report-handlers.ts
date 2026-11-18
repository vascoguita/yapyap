import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { bugReportUrl } from './crash-report.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Long enough for a careful description; the GitHub form takes the rest. */
const MAX_DESCRIPTION = 4000;
/** The issue title: the description's first line, shortened. */
const MAX_TITLE = 80;

export interface ProblemReportDependencies {
  /** The sanitized diagnostics: versions, platform, graphics and the redacted log. */
  readonly diagnostics: () => Promise<string>;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  readonly openExternal: (url: string) => Promise<unknown>;
  /** Records a performance trace, once the user agrees, for when YapYap is slow (#113). */
  readonly recordTrace: () => void;
}

function titleOf(description: string): string {
  const line = description
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '');
  if (line === undefined) {
    return en.report.issueTitle;
  }
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE)}…` : line;
}

const isDescription = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_DESCRIPTION;

/** The description and the diagnostics, as the clipboard carries them. */
const reportText = (description: string, diagnostics: string): string =>
  [description, diagnostics].filter((part) => part !== '').join('\n\n');

/**
 * Help → Report a Problem (#82): the user reviews the sanitized report in
 * YapYap, then it is copied and GitHub's bug form opens in the browser with
 * it filled in, or it is only copied, to share some other way (#693).
 * YapYap sends nothing itself; the user submits on GitHub.
 */
export function problemReportHandlers(deps: ProblemReportDependencies): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.reportDiagnostics,
      accepts: noArguments,
      handle: () => deps.diagnostics(),
    },
    {
      channel: CHROME_CHANNELS.reportOpen,
      accepts: argumentsOf(isDescription),
      handle: async (_call, description) => {
        const text = (description as string).trim();
        const diagnostics = await deps.diagnostics();
        await deps.writeClipboard(reportText(text, diagnostics));
        await deps.openExternal(
          bugReportUrl({ title: titleOf(text), whatHappened: text, diagnostics }),
        );
      },
    },
    {
      channel: CHROME_CHANNELS.reportCopy,
      accepts: argumentsOf(isDescription),
      handle: async (_call, description) => {
        await deps.writeClipboard(
          reportText((description as string).trim(), await deps.diagnostics()),
        );
      },
    },
    {
      channel: CHROME_CHANNELS.reportTrace,
      accepts: noArguments,
      handle: () => {
        deps.recordTrace();
      },
    },
  ];
}

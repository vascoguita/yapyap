import { CHROME_CHANNELS } from '../../shared/api/chrome-api.ts';
import { noArguments } from '../ipc/arguments.ts';
import type { ChromeCall, ChromeHandler } from '../ipc/chrome.ts';
import type { Recovery } from './controller.ts';

/** The recovery screen's operations, each on the recovery that owns the calling screen. */
export function recoveryHandlers(recoveries: ReadonlyMap<object, Recovery>): ChromeHandler[] {
  const of = ({ sender }: ChromeCall): Recovery => {
    const recovery = [...recoveries.values()].find((candidate) => candidate.owns(sender));
    if (recovery === undefined) {
      throw new Error('No recovery screen belongs to this window.');
    }
    return recovery;
  };
  const operation = (channel: string, run: (recovery: Recovery) => unknown): ChromeHandler => ({
    channel,
    accepts: noArguments,
    handle: (call) => run(of(call)),
  });
  return [
    operation(CHROME_CHANNELS.recoveryProblem, (recovery) => recovery.problem()),
    operation(CHROME_CHANNELS.recoveryRetry, (recovery) => recovery.retry()),
    operation(CHROME_CHANNELS.recoveryClearCache, (recovery) => recovery.clearCacheAndRetry()),
    operation(CHROME_CHANNELS.recoveryCopyDiagnostics, (recovery) => recovery.copyDiagnostics()),
  ];
}

import type { SettingsService } from '../settings/service.ts';

export interface QuietAccount {
  readonly id: string;
  readonly muted?: boolean;
}

export interface AudioPage {
  setAudioMuted(muted: boolean): void;
}

/** Do not disturb silences every account; muting silences one (#61). */
export function isSilenced(doNotDisturb: boolean, account: QuietAccount): boolean {
  return doNotDisturb || account.muted === true;
}

/**
 * WhatsApp plays message sounds and ringtones in its own page, which no
 * notification setting reaches, so a silenced account's page is muted. The
 * account on screen keeps its sound: muting it would also silence the voice
 * messages and videos the user plays (ADR 0008).
 */
export function quietAudio(
  pages: readonly { readonly account: QuietAccount; readonly page: AudioPage }[],
  doNotDisturb: boolean,
  /** The account the user sees, if the window is shown. */
  onScreen: string | undefined,
): void {
  for (const { account, page } of pages) {
    page.setAudioMuted(isSilenced(doNotDisturb, account) && account.id !== onScreen);
  }
}

/** Turns do not disturb on or off, from the tray or the menu. */
export function setDoNotDisturb(settings: Pick<SettingsService, 'update'>, on: boolean): void {
  settings.update((current) => ({ ...current, general: { ...current.general, doNotDisturb: on } }));
}

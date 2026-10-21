import { expect, type Page } from '@playwright/test';

/** What WhatsApp's media needs: H.264 and AAC for videos and GIFs, Opus for voice notes. */
const MEDIA_TYPES = [
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'audio/ogg; codecs="opus"',
] as const;

interface PlaybackReport {
  readonly support: readonly string[];
  readonly video: {
    readonly playing: boolean;
    readonly videoBytes: number;
    readonly audioBytes: number;
  };
  readonly voice: { readonly playing: boolean; readonly audioBytes: number };
}

/**
 * Asks the page which codecs it supports, then plays the fake page's clips
 * (served under /media/) for real and reports how many bytes were decoded,
 * which shows the sound was decoded too, not just the picture. Runs inside
 * any page on the fake WhatsApp origin, packaged or not.
 */
function checkPlayback(page: Page): Promise<PlaybackReport> {
  return page.evaluate(async (types) => {
    type Decoded = HTMLMediaElement & {
      webkitAudioDecodedByteCount: number;
      webkitVideoDecodedByteCount?: number;
    };
    const play = async (element: HTMLMediaElement, src: string): Promise<Decoded> => {
      element.src = src;
      element.muted = false;
      await element.play();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${src} did not advance`));
        }, 10_000);
        element.addEventListener('timeupdate', () => {
          if (element.currentTime > 0.3) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      element.pause();
      return element as Decoded;
    };
    const probe = document.createElement('video');
    const video = await play(document.createElement('video'), '/media/clip.mp4');
    const voice = await play(document.createElement('audio'), '/media/voice.ogg');
    return {
      support: types.map((type) => probe.canPlayType(type)),
      video: {
        playing: video.currentTime > 0,
        videoBytes: video.webkitVideoDecodedByteCount ?? 0,
        audioBytes: video.webkitAudioDecodedByteCount,
      },
      voice: { playing: voice.currentTime > 0, audioBytes: voice.webkitAudioDecodedByteCount },
    };
  }, MEDIA_TYPES);
}

/** Holds the page to playing every kind of WhatsApp media with sound. */
export async function expectMediaPlayback(page: Page): Promise<void> {
  const report = await checkPlayback(page);
  expect(report.support).toEqual(['probably', 'probably']);
  expect(report.video.playing).toBe(true);
  expect(report.video.videoBytes).toBeGreaterThan(0);
  expect(report.video.audioBytes).toBeGreaterThan(0);
  expect(report.voice.playing).toBe(true);
  expect(report.voice.audioBytes).toBeGreaterThan(0);
}

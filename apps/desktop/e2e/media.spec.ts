import { expect, test } from './fixtures.ts';
import { expectMediaPlayback } from './media-check.ts';

// The clips under test/fake-whatsapp/media are one-second synthetic tones and
// test patterns, made with:
//   ffmpeg -f lavfi -i testsrc=size=64x64:rate=10 -f lavfi -i sine=frequency=440 -t 1 \
//     -c:v libx264 -profile:v baseline -pix_fmt yuv420p -c:a aac -b:a 32k clip.mp4
//   ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1 -c:a libopus -b:a 16k voice.ogg
test('plays videos, GIFs and voice notes with sound', async ({ window }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await expectMediaPlayback(window);
});

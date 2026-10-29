import { serveRecorder } from './capture.ts';
import { opusEncoder, wavEncoder } from './encoders.ts';

serveRecorder(globalThis.yapyap.recorder, {
  getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  mix: (streams) => {
    const context = new AudioContext();
    const out = context.createMediaStreamDestination();
    for (const stream of streams) {
      context.createMediaStreamSource(stream).connect(out);
    }
    return out.stream;
  },
  encoder: (stream, format) => (format === 'wav' ? wavEncoder(stream) : opusEncoder(stream)),
});

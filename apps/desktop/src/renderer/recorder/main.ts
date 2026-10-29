import { serveRecorder } from './capture.ts';

/** Opus in WebM: small files that every platform's players open. */
const FORMAT = 'audio/webm;codecs=opus';

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
  encoder: (stream) => {
    const recorder = new MediaRecorder(stream, { mimeType: FORMAT });
    return {
      start: (timeslice, onData, onStop) => {
        recorder.ondataavailable = ({ data }) => {
          onData(data);
        };
        recorder.onstop = () => {
          onStop();
        };
        recorder.start(timeslice);
      },
      stop: () => {
        recorder.stop();
      },
    };
  },
});

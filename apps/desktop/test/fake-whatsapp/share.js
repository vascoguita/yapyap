// Asks for a screen share the way WhatsApp Web's call screen does, and reports
// only what was granted, never the captured pixels.
document.querySelector('[data-testid="share-screen"]').addEventListener('click', () => {
  const result = document.querySelector('[data-testid="share-result"]');
  navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(
    (stream) => {
      result.textContent = `shared ${String(stream.getVideoTracks().length)} video track`;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    },
    (error) => {
      result.textContent = error.name;
    },
  );
});

// Keeps a share running, as a call does, until the page or YapYap stops it,
// and reports when it has ended.
let running;
const status = document.querySelector('[data-testid="share-status"]');
document.querySelector('[data-testid="share-keep"]').addEventListener('click', () => {
  navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then((stream) => {
    running = stream;
    status.textContent = 'sharing';
    const watch = window.setInterval(() => {
      if (stream.getVideoTracks().every((track) => track.readyState === 'ended')) {
        window.clearInterval(watch);
        status.textContent = 'ended';
      }
    }, 100);
  });
});
document.querySelector('[data-testid="share-stop"]').addEventListener('click', () => {
  for (const track of running?.getTracks() ?? []) {
    track.stop();
  }
});

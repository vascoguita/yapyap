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

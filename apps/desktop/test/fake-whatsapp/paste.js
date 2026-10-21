// Reports what a paste into the composer carried, as WhatsApp would see it:
// file names and types only, never their contents.
document.querySelector('[data-testid="composer"]').addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files ?? [])];
  document.querySelector('[data-testid="paste-result"]').textContent = JSON.stringify(
    files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
  );
});

// Tries to write the clipboard as the page loads, with no user action at all.
navigator.clipboard.writeText('written on load').then(
  () => {
    document.querySelector('[data-testid="load-write"]').textContent = 'allowed';
  },
  (error) => {
    document.querySelector('[data-testid="load-write"]').textContent = error.name;
  },
);

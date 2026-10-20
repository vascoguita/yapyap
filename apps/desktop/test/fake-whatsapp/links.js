// Mirrors how WhatsApp Web opens some links: an empty popup whose location is
// set afterwards, which a plain window-open handler never sees.
document.querySelector('[data-testid="popup-then-navigate"]').addEventListener('click', () => {
  const popup = window.open('', '_blank');
  if (popup) popup.location.href = 'https://example.com/from-popup';
});

document.querySelector('[data-testid="popup-blank"]').addEventListener('click', () => {
  window.open('about:blank', '_blank');
});

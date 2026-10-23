// Opens a call the ways WhatsApp Web does: a window on its own origin, either
// directly or as a blank window it then points at the call page.
document.querySelector('[data-testid="call"]').addEventListener('click', () => {
  window.open('/call.html', 'call', 'width=480,height=640');
});
document.querySelector('[data-testid="call-blank"]').addEventListener('click', () => {
  const call = window.open('about:blank', 'call-blank', 'width=480,height=640');
  call.location.href = '/call.html';
});

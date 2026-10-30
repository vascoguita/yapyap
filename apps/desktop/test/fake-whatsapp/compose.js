// Sends the composer's text on Enter, as WhatsApp does, adding it to the chat
// as the account's own message (#407).
const composer = document.querySelector('[data-testid="composer"]');
composer.addEventListener('keydown', (event) => {
  const text = composer.textContent.trim();
  if (event.key !== 'Enter' || event.shiftKey || text === '') {
    return;
  }
  event.preventDefault();
  const row = document.createElement('div');
  row.setAttribute('role', 'row');
  row.dataset.testid = 'sent';
  row.innerHTML = '<span data-testid="tail-out"></span><span data-testid="selectable-text"></span>';
  row.querySelector('[data-testid="selectable-text"]').textContent = text;
  // After the last message, as WhatsApp keeps its messages apart from the
  // message box, with the assistant bar between them (#466).
  [...composer.closest('#main').querySelectorAll(':scope > [role="row"]')].at(-1).after(row);
  composer.textContent = '';
});

// Sends the composer's text on Enter, as WhatsApp does, adding it to the chat
// as the account's own message (#407), with an ID of its own as WhatsApp gives one.
const composer = document.querySelector('[data-testid="composer"]');
let sentCount = 0;

// As WhatsApp's editor does, the message box puts its caret back after the
// draft right after it takes the focus, so a selection made at that moment
// is lost (#609).
composer.addEventListener('focus', () => {
  void Promise.resolve().then(() => {
    document.getSelection().collapse(composer, composer.childNodes.length);
  });
});
composer.addEventListener('keydown', (event) => {
  const text = composer.textContent.trim();
  if (event.key !== 'Enter' || event.shiftKey || text === '') {
    return;
  }
  event.preventDefault();
  const row = document.createElement('div');
  row.setAttribute('role', 'row');
  row.dataset.testid = 'sent';
  sentCount += 1;
  row.innerHTML =
    '<div><span data-testid="tail-out"></span><span data-testid="selectable-text"></span></div>';
  row.firstElementChild.dataset.id = `3EB0S${String(sentCount)}`;
  row.querySelector('[data-testid="selectable-text"]').textContent = text;
  // After the last message, as WhatsApp keeps its messages apart from the
  // message box, with the assistant bar between them (#466).
  [...composer.closest('#main').querySelectorAll('[role="row"]')].at(-1).after(row);
  composer.textContent = '';
});

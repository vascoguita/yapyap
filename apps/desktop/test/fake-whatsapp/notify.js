// Shows notifications the way WhatsApp Web does, with the Web Notifications
// API, and reports what the page saw: the permission and any click.
let latest;
const result = document.querySelector('[data-testid="notify-result"]');
document.querySelector('[data-testid="notify"]').addEventListener('click', () => {
  result.textContent = `permission ${window.Notification.permission}`;
  latest = new window.Notification('Test Chat One', { body: 'Hello from the test', tag: 'chat-1' });
  latest.onclick = () => {
    result.textContent = 'clicked';
  };
});
document.querySelector('[data-testid="notify-read"]').addEventListener('click', () => {
  latest?.close();
});

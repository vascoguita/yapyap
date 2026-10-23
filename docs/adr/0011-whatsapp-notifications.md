# 0011. WhatsApp notifications

- Status: Accepted
- Date: 2026-10-23

## Context

WhatsApp Web announces new messages with the Web Notifications API
(`new Notification(title, options)`). Chromium shows those notifications
itself, so YapYap never sees them: it cannot say which account a
notification belongs to, switch to that account when the user clicks it,
honour do-not-disturb (#61) or the privacy options (#62), or withdraw
notifications when YapYap quits. Electron offers no hook for web
notifications in the main process.

## Decision

- WhatsApp's views get one preload, `src/preload/whatsapp/`. With
  `contextBridge.executeInMainWorld` it replaces the page's `Notification`
  with a stand-in before any page script runs. The stand-in behaves like the
  Web API (permission `granted`, `requestPermission`, `close`, `onclick`,
  `click` and `close` events) and forwards each notification as plain data.
- The bridge it uses, exposed with `contextBridge.exposeInMainWorld`, has
  three operations and nothing else: show a notification (an ID, title, body,
  tag and silent flag, all strings or booleans), close one, and listen for
  clicks on them. The page can call them, which gives it no more than the
  Web API already did.
- The main process accepts these messages only from a registered WhatsApp
  view's main frame on WhatsApp's origin, checks every field's type and
  length, and drops anything else. At most 30 notifications a minute are
  shown per account; the rest are dropped and counted in the log, never with
  their content.
- The main process shows a native notification for the page. With more than
  one account, the account's name heads the notification. Images from the
  page are not shown: YapYap uses its own icon, so no avatar is fetched.
- Clicking a notification brings the window forward, switches to its account
  and tells the page, whose stand-in fires `click`, so WhatsApp opens the
  chat itself. When WhatsApp closes a notification, for example because the
  chat was read on the phone, YapYap withdraws it. Removing an account and
  quitting withdraw all of its notifications.
- Notification text is message content: it is never logged, stored or sent
  anywhere but to the system's notification service.
- If the system has no notification service, YapYap logs that once and keeps
  trying for later notifications, so notifications return when the service
  does.

## Consequences

- YapYap now owns how notifications look and behave, which do-not-disturb,
  per-account mute and privacy options build on.
- WhatsApp's own notification sound settings still apply, through the
  `silent` flag.
- A WhatsApp change to how it shows notifications (for example moving to a
  service worker's `showNotification`) would bypass the stand-in; the fake
  page and the E2E tests cover the Web API path WhatsApp uses today.
- The preload is the first code YapYap runs in WhatsApp's main world. It
  stays minimal and is reviewed as security-critical, like the IPC handlers.

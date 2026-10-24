import { Type } from 'typebox';
import { en } from '../../shared/messages/en.ts';
import type { RpcMethod } from './rpc.ts';

export interface HostServices {
  /** Shows a native notification. */
  readonly notify: (title: string, body: string) => void;
  /** Do not disturb is on, so nothing may show. */
  readonly quiet: () => boolean;
}

const Notification = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 120 }),
    body: Type.String({ maxLength: 1000 }),
  },
  { additionalProperties: false },
);

/**
 * The host operations a plugin can call, each behind the capability its
 * SDK documentation names. Operations not listed here are not offered yet.
 */
export function hostMethods(
  plugin: { readonly name: string },
  services: HostServices,
): Readonly<Record<string, RpcMethod>> {
  return {
    'notifications.show': {
      capability: 'notifications:show',
      params: Type.Tuple([Notification]),
      run: ([notification]) => {
        const { title, body } = notification as { readonly title: string; readonly body: string };
        if (!services.quiet()) {
          services.notify(en.plugins.notificationTitle(plugin.name, title), body);
        }
        return Promise.resolve();
      },
    },
  };
}

import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { ProxyLogin } from './ProxyLogin.tsx';

mount(ProxyLogin, { title: en.windows.proxyLogin, escape: closeOnEscape });

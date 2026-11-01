import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { Welcome } from './Welcome.tsx';

mount(Welcome, { title: en.windows.welcome, escape: closeOnEscape });

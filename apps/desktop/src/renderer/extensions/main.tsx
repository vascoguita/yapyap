import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { Extensions } from './Extensions.tsx';

mount(Extensions, { title: en.windows.extensions, escape: closeOnEscape });

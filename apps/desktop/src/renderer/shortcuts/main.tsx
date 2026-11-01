import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { Shortcuts } from './Shortcuts.tsx';

mount(Shortcuts, { title: en.windows.shortcuts, escape: closeOnEscape });

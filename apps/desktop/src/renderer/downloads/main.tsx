import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { Downloads } from './Downloads.tsx';

mount(Downloads, { title: en.windows.downloads, escape: closeOnEscape });

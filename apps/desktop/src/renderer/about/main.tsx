import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { About } from './About.tsx';

mount(About, { title: en.windows.about, escape: closeOnEscape });

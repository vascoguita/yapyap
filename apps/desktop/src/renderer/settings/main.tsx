import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { Settings } from './Settings.tsx';

mount(Settings, { title: en.windows.settings, escape: closeOnEscape });

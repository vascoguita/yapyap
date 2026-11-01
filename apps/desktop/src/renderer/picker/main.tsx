import { en } from '../../shared/messages/en.ts';
import { mount } from '../shared/mount.tsx';
import { Picker, cancelOnEscape } from './Picker.tsx';

mount(Picker, { title: en.windows.picker, escape: cancelOnEscape });

import { en } from '../../shared/messages/en.ts';
import { mount } from '../shared/mount.tsx';
import { CustomCodeEditor } from './CustomCode.tsx';

mount(CustomCodeEditor, { title: en.windows.customCode });

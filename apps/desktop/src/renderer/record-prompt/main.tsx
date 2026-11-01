import { en } from '../../shared/messages/en.ts';
import { mount } from '../shared/mount.tsx';
import { RecordPrompt } from './RecordPrompt.tsx';

mount(RecordPrompt, { title: en.recording.windowTitle });

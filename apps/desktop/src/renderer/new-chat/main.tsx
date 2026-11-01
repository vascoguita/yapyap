import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { NewChat } from './NewChat.tsx';

mount(NewChat, { title: en.windows.newChat, escape: closeOnEscape });

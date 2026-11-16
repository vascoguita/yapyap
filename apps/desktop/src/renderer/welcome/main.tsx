import { en } from '../../shared/messages/en.ts';
import { mount } from '../shared/mount.tsx';
import { Welcome } from './Welcome.tsx';

mount(Welcome, { title: en.windows.welcome });

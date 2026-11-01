import { en } from '../../shared/messages/en.ts';
import { closeOnEscape, mount } from '../shared/mount.tsx';
import { SpellingLanguagesPage } from './SpellingLanguages.tsx';

mount(SpellingLanguagesPage, { title: en.windows.spellingLanguages, escape: closeOnEscape });

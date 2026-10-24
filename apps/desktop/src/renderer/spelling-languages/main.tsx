import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { SpellingLanguagesPage } from './SpellingLanguages.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<SpellingLanguagesPage api={globalThis.yapyap} />, document.body);

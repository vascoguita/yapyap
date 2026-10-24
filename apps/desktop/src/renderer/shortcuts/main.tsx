import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { Shortcuts } from './Shortcuts.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<Shortcuts api={globalThis.yapyap} />, document.body);

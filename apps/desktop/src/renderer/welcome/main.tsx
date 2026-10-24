import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { Welcome } from './Welcome.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<Welcome api={globalThis.yapyap} />, document.body);

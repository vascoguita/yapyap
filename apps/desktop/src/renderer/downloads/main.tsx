import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { Downloads } from './Downloads.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<Downloads api={globalThis.yapyap} />, document.body);

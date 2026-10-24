import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { CustomCodeEditor } from './CustomCode.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<CustomCodeEditor api={globalThis.yapyap} />, document.body);

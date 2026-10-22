import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { NewChat } from './NewChat.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<NewChat api={globalThis.yapyap} />, document.body);

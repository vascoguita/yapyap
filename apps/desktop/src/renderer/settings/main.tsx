import { render } from 'preact';
import { closeOnEscape, Settings } from './Settings.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<Settings api={window.yapyap} />, document.body);

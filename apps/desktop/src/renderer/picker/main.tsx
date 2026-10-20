import { render } from 'preact';
import { cancelOnEscape, Picker } from './Picker.tsx';

document.addEventListener('keydown', cancelOnEscape(window.yapyap));
render(<Picker api={window.yapyap} />, document.body);

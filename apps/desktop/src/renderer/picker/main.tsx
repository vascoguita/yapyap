import { render } from 'preact';
import { cancelOnEscape, Picker } from './Picker.tsx';

document.addEventListener('keydown', cancelOnEscape(globalThis.yapyap));
render(<Picker api={globalThis.yapyap} />, document.body);

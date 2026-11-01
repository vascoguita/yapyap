import { render } from 'preact';
import { CustomCodeEditor } from './CustomCode.tsx';

render(<CustomCodeEditor api={globalThis.yapyap} />, document.body);

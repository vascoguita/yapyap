import { render } from 'preact';
import { RecordPrompt } from './RecordPrompt.tsx';

render(<RecordPrompt api={globalThis.yapyap} />, document.body);

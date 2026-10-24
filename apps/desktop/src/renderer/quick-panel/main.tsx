import { render } from 'preact';
import { QuickPanel } from './QuickPanel.tsx';

render(<QuickPanel api={globalThis.yapyap} />, document.body);

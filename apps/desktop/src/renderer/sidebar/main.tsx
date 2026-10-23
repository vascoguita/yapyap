import { render } from 'preact';
import { Sidebar } from './Sidebar.tsx';

render(<Sidebar api={globalThis.yapyap} />, document.body);

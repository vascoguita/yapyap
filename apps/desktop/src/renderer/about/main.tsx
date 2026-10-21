import { render } from 'preact';
import { About } from './About.tsx';

render(<About api={globalThis.yapyap} />, document.body);

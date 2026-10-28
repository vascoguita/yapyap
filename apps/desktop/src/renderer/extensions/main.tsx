import { render } from 'preact';
import { Extensions } from './Extensions.tsx';

render(<Extensions api={globalThis.yapyap} />, document.body);

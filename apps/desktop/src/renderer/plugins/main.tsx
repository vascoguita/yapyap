import { render } from 'preact';
import { Plugins } from './Plugins.tsx';

render(<Plugins api={globalThis.yapyap} />, document.body);

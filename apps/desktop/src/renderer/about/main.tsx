import { render } from 'preact';
import { About } from './About.tsx';

render(<About api={window.yapyap} />, document.body);

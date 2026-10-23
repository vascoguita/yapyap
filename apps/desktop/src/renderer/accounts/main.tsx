import { render } from 'preact';
import { Accounts } from './Accounts.tsx';

render(<Accounts api={globalThis.yapyap} />, document.body);

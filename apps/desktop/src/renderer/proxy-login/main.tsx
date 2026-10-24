import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { ProxyLogin } from './ProxyLogin.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<ProxyLogin api={globalThis.yapyap} />, document.body);

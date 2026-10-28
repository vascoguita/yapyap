import { render } from 'preact';
import { ExtensionConsent } from './ExtensionConsent.tsx';

render(<ExtensionConsent api={globalThis.yapyap} />, document.body);

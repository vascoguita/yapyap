import { render } from 'preact';
import { PluginConsent } from './PluginConsent.tsx';

render(<PluginConsent api={globalThis.yapyap} />, document.body);

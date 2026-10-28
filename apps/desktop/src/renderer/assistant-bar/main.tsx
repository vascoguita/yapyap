import { render } from 'preact';
import { AssistantBar } from './AssistantBar.tsx';

render(<AssistantBar api={globalThis.yapyap} />, document.body);

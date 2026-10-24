import { render } from 'preact';
import { closeOnEscape } from '../settings/Settings.tsx';
import { ProblemReport } from './ProblemReport.tsx';

document.addEventListener('keydown', closeOnEscape);
render(<ProblemReport api={globalThis.yapyap} />, document.body);

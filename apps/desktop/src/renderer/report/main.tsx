import { render } from 'preact';
import { ProblemReport } from './ProblemReport.tsx';

render(<ProblemReport api={globalThis.yapyap} />, document.body);

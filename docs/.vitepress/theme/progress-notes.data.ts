import { createContentLoader } from 'vitepress';

/** One note file of `docs/progress/notes/`, rendered. */
export interface ProgressNote {
  readonly issue: number;
  readonly html: string;
}

declare const data: ProgressNote[];
export { data };

/** The issue a note's file is named by, as in `/progress/notes/123`. */
const issueOf = (url: string): number =>
  Number(
    url
      .split('/')
      .at(-1)
      ?.replace(/\.html$/, ''),
  );

// Each pull request adds its own file, so none edits another's lines (#660);
// the page lists them in issue-number order.
export default createContentLoader('progress/notes/*.md', {
  render: true,
  transform: (pages): ProgressNote[] =>
    pages
      .map((page) => ({ issue: issueOf(page.url), html: page.html ?? '' }))
      .sort((first, second) => first.issue - second.issue),
});

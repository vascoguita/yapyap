/** What the site's daily build counted (#347); see scripts/src/release/downloads.ts. */
interface DownloadCounts {
  readonly total: number;
}

const isCounts = (value: unknown): value is DownloadCounts =>
  Number.isInteger((value as Partial<DownloadCounts> | null)?.total);

/**
 * Fills the page's download count from the site's own downloads.json, so
 * showing it asks no third party for anything. A page without the count,
 * or a build without the file, such as a local preview, shows nothing.
 */
export async function showDownloads(): Promise<void> {
  const element = document.querySelector<HTMLElement>('[data-downloads]');
  if (element === null) {
    return;
  }
  const response = await fetch('/downloads.json').catch(() => undefined);
  const counts: unknown = response?.ok === true ? await response.json() : undefined;
  if (isCounts(counts) && counts.total > 0) {
    element.textContent = `Downloaded ${counts.total.toLocaleString('en')} times`;
    element.hidden = false;
  }
}

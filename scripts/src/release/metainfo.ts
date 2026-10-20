const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASES = 'https://github.com/vascoguita/yapyap/releases/tag/v';

/**
 * Adds a release entry to AppStream metainfo, which software centers and
 * Flathub require. Stamping the same version twice leaves the file unchanged.
 */
export function stampRelease(metainfo: string, version: string, date: string): string {
  if (!VERSION.test(version)) throw new Error(`Not a release version: ${version}`);
  if (!DATE.test(date)) throw new Error(`Not an ISO date: ${date}`);
  if (metainfo.includes(`<release version="${version}"`)) return metainfo;
  const entry = [
    `    <release version="${version}" date="${date}">`,
    `      <url type="details">${RELEASES}${version}</url>`,
    '    </release>',
  ].join('\n');
  if (metainfo.includes('<releases/>')) {
    return metainfo.replace('<releases/>', `<releases>\n${entry}\n  </releases>`);
  }
  if (metainfo.includes('<releases>')) return metainfo.replace('<releases>', `<releases>\n${entry}`);
  throw new Error('The metainfo has no <releases> element');
}

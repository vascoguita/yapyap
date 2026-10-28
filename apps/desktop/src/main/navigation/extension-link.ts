import { ManifestSchema } from '@yapyap/extension-sdk';
import { Value } from 'typebox/value';

/** Long enough for any extension ID; anything longer is not a link YapYap made. */
const MAX_LINK_LENGTH = 200;
const PREFIX = 'yapyap://extensions/install/';

/**
 * The extension a website's **Install in YapYap** link names (ADR 0014):
 * exactly `yapyap://extensions/install/<id>`, with a valid extension ID and
 * nothing else, no query, fragment, credentials or further path. The link
 * never carries a URL, file or version; YapYap looks the ID up in its
 * signed index.
 */
export function extensionLinkTarget(link: string): string | undefined {
  if (link.length > MAX_LINK_LENGTH || !link.startsWith(PREFIX)) {
    return undefined;
  }
  const id = link.slice(PREFIX.length);
  return Value.Check(ManifestSchema.properties.id, id) ? id : undefined;
}

/** The first extension install link on a command line. */
export function extensionLinkInArguments(argv: readonly string[]): string | undefined {
  return argv.map(extensionLinkTarget).find((id) => id !== undefined);
}

import { describe, expect, it } from 'vitest';
import { marketplaceSource } from './source.ts';

const ANCHORS = ['real anchor'];
const TEST = {
  YAPYAP_TEST_MARKETPLACE_ORIGIN: 'http://127.0.0.1:4100',
  YAPYAP_TEST_MARKETPLACE_ANCHOR: 'test anchor',
};

describe('marketplaceSource', () => {
  it('uses packages.guita.org and the first-party anchors', () => {
    const source = marketplaceSource({}, true, ANCHORS);
    expect(source).toMatchObject({
      indexUrl: 'https://packages.guita.org/extensions/index.json',
      signatureUrl: 'https://packages.guita.org/extensions/index.json.sig',
      anchors: ANCHORS,
    });
    expect(source.archiveUrl('org.example.hello', '1.0.0')).toBe(
      'https://packages.guita.org/extensions/org.example.hello/org.example.hello-1.0.0.yapyap-extension',
    );
  });

  it('lets an unpackaged build use a local test marketplace with its own key', () => {
    const source = marketplaceSource(TEST, false, ANCHORS);
    expect(source).toMatchObject({
      indexUrl: 'http://127.0.0.1:4100/extensions/index.json',
      signatureUrl: 'http://127.0.0.1:4100/extensions/index.json.sig',
      anchors: ['test anchor'],
    });
    expect(source.archiveUrl('org.example.hello', '1.0.0')).toBe(
      'http://127.0.0.1:4100/extensions/org.example.hello/org.example.hello-1.0.0.yapyap-extension',
    );
  });

  it.each([
    ['a packaged build', TEST, true],
    ['a remote origin', { ...TEST, YAPYAP_TEST_MARKETPLACE_ORIGIN: 'https://evil.example' }, false],
    ['no test key', { YAPYAP_TEST_MARKETPLACE_ORIGIN: TEST.YAPYAP_TEST_MARKETPLACE_ORIGIN }, false],
    ['no test origin', { YAPYAP_TEST_MARKETPLACE_ANCHOR: 'test anchor' }, false],
  ])('ignores the test marketplace for %s', (_case, env, packaged) => {
    expect(marketplaceSource(env, packaged, ANCHORS)).toMatchObject({
      indexUrl: 'https://packages.guita.org/extensions/index.json',
      anchors: ANCHORS,
    });
  });
});

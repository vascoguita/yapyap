/**
 * YapYap's one way of showing that something is working: a thin light
 * that travels around the edge of the pill that works, slowly and in the
 * accent color alone, without covering its text or moving the layout. The
 * AI assistant's blank suggestions and its rewrite button use it, and so
 * does a spelling dictionary while it downloads, so all three look alike.
 *
 * An element with the `working` class gets it, given `--edge`, the light's
 * color, and `--edge-fill`, its own background. A pseudo-element larger
 * than the pill carries the light and turns, and another, inset by the
 * ring's width, paints the fill back over its middle. The light is a
 * square centered by equal insets, so it turns about the pill's middle in
 * either writing direction, and covers pills up to about 300px wide at
 * every angle. Chromium ignores
 * `@property` in shadow roots, so the gradient's angle cannot animate on
 * its own there. For people who ask for less motion, the whole ring shows
 * still, faded. Settings' stylesheet carries the same rule, which its
 * content security policy keeps from being injected; a test holds the two
 * alike.
 */
export const WORKING_EDGE = `
.working {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-color: transparent;
}
.working::before {
  content: '';
  position: absolute;
  z-index: -2;
  inset: -999px;
  inline-size: 480px;
  block-size: 480px;
  margin: auto;
  background: conic-gradient(transparent 0deg 250deg, var(--edge) 330deg, transparent 360deg);
  animation: working-edge 1.6s linear infinite;
}
.working::after {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 1.5px;
  border-radius: inherit;
  background: var(--edge-fill);
}
@keyframes working-edge {
  to {
    rotate: 1turn;
  }
}
@media (prefers-reduced-motion: reduce) {
  .working::before {
    animation: none;
    background: var(--edge);
    opacity: 0.5;
  }
}
`;

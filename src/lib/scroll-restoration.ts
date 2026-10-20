import type { ParsedLocation } from "@tanstack/react-router";

export function createScrollRestorationKey() {
  // Keep Back/Forward restoration within this document, but don't reuse a
  // previous document's saved position after a refresh. The router still
  // handles scrolling to the top and explicit hash targets.
  const documentKey = crypto.randomUUID();
  return (location: ParsedLocation) =>
    `${documentKey}:${location.state.__TSR_key || location.href}`;
}

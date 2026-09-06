/**
 * Isolated-world content script on Language Reactor cues.
 * Gloss cards live in a docked sidebar; .lln-word nodes are never wrapped.
 */
import { installHoverHold } from "./hover-hold";
import { ensureRuntime } from "./runtime";
import { isLanguageReactorHost } from "./host";

if (!isLanguageReactorHost()) {
  /* Language Reactor site only */
} else {
  installHoverHold();
  ensureRuntime();
}

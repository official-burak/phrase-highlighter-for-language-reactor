/**
 * Bundle Chrome MV3 content scripts.
 * MAIN world: dist/page-hook.js (prefetch sniff + postMessage)
 * ISOLATED world: dist/content.js (gloss panel)
 */
import * as esbuild from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

const shared = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome111"],
  sourcemap: false,
  legalComments: "none",
};

await esbuild.build({
  ...shared,
  entryPoints: ["src/page-hook.ts"],
  outfile: "dist/page-hook.js",
});

await esbuild.build({
  ...shared,
  entryPoints: ["src/content.ts"],
  outfile: "dist/content.js",
});

console.log("built dist/page-hook.js dist/content.js");

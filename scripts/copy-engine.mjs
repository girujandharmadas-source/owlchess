// Copies the single-threaded lite Stockfish build into /public so it can be loaded as a Web Worker.
// Single-threaded = no SharedArrayBuffer, so no COOP/COEP headers are required.
import { copyFileSync, mkdirSync } from "node:fs";
const src = "node_modules/stockfish/bin";
const dst = "public/stockfish";
mkdirSync(dst, { recursive: true });
for (const f of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  copyFileSync(`${src}/${f}`, `${dst}/${f}`);
}
console.log("Stockfish engine copied to public/stockfish");

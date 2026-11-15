// Integration test: drives the real Stockfish 19 lite WASM engine through StockfishEngine,
// using a tiny Worker shim around the Node build of the `stockfish` package.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StockfishEngine } from "./engine";

const require = createRequire(import.meta.url);

class NodeStockfishWorker {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  private sf: { processCommand: (c: string) => void; terminate: () => void };
  constructor() {
    const load = require("stockfish") as (
      flavor: string,
      cb: (line: string) => void,
    ) => { processCommand: (c: string) => void; terminate: () => void };
    this.sf = load("lite-single", (line) => this.onmessage?.({ data: line }));
  }
  postMessage(cmd: string) {
    this.sf.processCommand(cmd);
  }
  terminate() {
    this.sf.terminate();
  }
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// White to move, mate in 1 (Qh5xf7#).
const SCHOLARS = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

describe("StockfishEngine (real WASM engine)", () => {
  let engine: StockfishEngine;

  beforeAll(async () => {
    (globalThis as unknown as { Worker: unknown }).Worker = NodeStockfishWorker;
    engine = new StockfishEngine("unused-in-node");
    await engine.ready;
  }, 30_000);

  afterAll(() => engine?.terminate());

  it("reads the UCI_Elo range from the engine", () => {
    expect(engine.eloRange).toEqual({ min: 1320, max: 3190 });
  });

  it("returns MultiPV lines with White-POV scores", async () => {
    const res = await engine.search(START, { movetime: 400, multipv: 3 });
    expect(res).not.toBeNull();
    expect(res!.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
    expect(res!.lines).toHaveLength(3);
    expect(res!.depth).toBeGreaterThanOrEqual(8);
    expect(Math.abs(res!.lines[0].whiteScore.value)).toBeLessThan(100);
  }, 15_000);

  it("finds mate in one", async () => {
    const res = await engine.search(SCHOLARS, { movetime: 300 });
    expect(res!.bestmove).toBe("h5f7");
    expect(res!.lines[0].whiteScore).toEqual({ type: "mate", value: 1 });
  }, 15_000);

  it("supersedes a running search: old resolves early, queued-but-stale ones resolve null", async () => {
    const t0 = Date.now();
    const first = engine.search(START, { movetime: 5000 });
    await new Promise((r) => setTimeout(r, 150));
    const stale = engine.search(START, { movetime: 5000 }); // queued behind `first`
    const latest = engine.search(SCHOLARS, { movetime: 300 }); // supersedes `stale`
    const [a, b, c] = await Promise.all([first, stale, latest]);
    expect(a).not.toBeNull(); // stopped early but still returns its best move
    expect(b).toBeNull();
    expect(c!.bestmove).toBe("h5f7");
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 15_000);

  it("plays legal moves with strength limited to 1320 Elo", async () => {
    await engine.setStrength(1320);
    const res = await engine.search(START, { movetime: 200 });
    expect(res!.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
    await engine.setStrength(null);
  }, 15_000);
});

"use client";

import {
  type InfoLine,
  type Score,
  parseBestMove,
  parseInfo,
  parseSpinOption,
  toWhitePov,
} from "./uci";

export const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";

export interface AnalysisLine extends InfoLine {
  /** Score converted to White's point of view. */
  whiteScore: Score;
}

export interface SearchResult {
  fen: string;
  bestmove: string | null;
  /** Indexed by multipv - 1. */
  lines: AnalysisLine[];
  /** Deepest completed depth of the primary line. */
  depth: number;
}

export interface SearchOptions {
  movetime: number;
  depth?: number;
  multipv?: number;
  onInfo?: (lines: AnalysisLine[]) => void;
}

type Listener = (line: string) => void;

/**
 * Thin promise-based wrapper around a Stockfish WASM Web Worker.
 *
 * - All commands that require the engine to be idle are serialized on an internal queue.
 * - Calling `search()` while a search is running sends `stop` to the running search; queued
 *   searches that have been superseded by a newer one resolve with `null` without running.
 */
export class StockfishEngine {
  private worker: Worker;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private searching = false;
  private disposed = false;

  readonly ready: Promise<void>;
  eloRange = { min: 1320, max: 3190 };

  constructor(url: string = ENGINE_URL) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === "string" ? e.data : String(e.data);
      for (const line of text.split("\n")) {
        if (!line) continue;
        for (const l of [...this.listeners]) l(line);
      }
    };
    const failed = new Promise<never>((_, reject) => {
      this.worker.onerror = (e) => reject(new Error(e.message || `Could not load engine from ${url}`));
    });
    this.ready = Promise.race([this.enqueue(() => this.init()), failed]);
  }

  private send(cmd: string) {
    if (!this.disposed) this.worker.postMessage(cmd);
  }

  private waitFor(pred: (line: string) => boolean, onLine?: Listener): Promise<string> {
    return new Promise((resolve) => {
      const l: Listener = (line) => {
        onLine?.(line);
        if (pred(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(task, task);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async init() {
    const done = this.waitFor(
      (l) => l === "uciok",
      (l) => {
        const opt = parseSpinOption(l);
        if (opt?.name === "UCI_Elo") this.eloRange = { min: opt.min, max: opt.max };
      },
    );
    this.send("uci");
    await done;
    await this.isReady();
  }

  private async isReady() {
    const p = this.waitFor((l) => l === "readyok");
    this.send("isready");
    await p;
  }

  /** Set a UCI option (applied between searches). */
  setOption(name: string, value: string | number | boolean): Promise<void> {
    return this.enqueue(async () => {
      this.send(`setoption name ${name} value ${value}`);
      await this.isReady();
    });
  }

  /** Limit playing strength to a given Elo, or `null` for full strength. */
  async setStrength(elo: number | null): Promise<void> {
    if (elo === null) {
      await this.setOption("UCI_LimitStrength", false);
    } else {
      await this.setOption("UCI_LimitStrength", true);
      await this.setOption("UCI_Elo", elo);
    }
  }

  /** Reset hash/state for a new game. */
  newGame(): Promise<void> {
    this.stop();
    return this.enqueue(async () => {
      this.send("ucinewgame");
      await this.isReady();
    });
  }

  /** Search a position. Resolves with null if superseded by a newer search before it started. */
  search(fen: string, opts: SearchOptions): Promise<SearchResult | null> {
    const gen = ++this.generation;
    if (this.searching) this.send("stop");

    return this.enqueue(async () => {
      if (gen !== this.generation || this.disposed) return null;
      const multipv = opts.multipv ?? 1;
      const sideToMove = (fen.split(" ")[1] ?? "w") as "w" | "b";
      const lines: AnalysisLine[] = [];

      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`position fen ${fen}`);
      this.searching = true;
      const done = this.waitFor(
        (l) => parseBestMove(l) !== undefined,
        (l) => {
          const info = parseInfo(l);
          if (!info || info.multipv > multipv) return;
          lines[info.multipv - 1] = { ...info, whiteScore: toWhitePov(info.score, sideToMove) };
          if (gen === this.generation) opts.onInfo?.(lines.slice());
        },
      );
      const depthArg = opts.depth ? ` depth ${Math.max(1, Math.round(opts.depth))}` : "";
      this.send(`go${depthArg} movetime ${Math.max(50, Math.round(opts.movetime))}`);
      const bestLine = await done;
      this.searching = false;
      return {
        fen,
        bestmove: parseBestMove(bestLine) ?? null,
        lines: lines.filter(Boolean),
        depth: lines[0]?.depth ?? 0,
      };
    });
  }

  /** Stop the running search (it still resolves with its best result so far). */
  stop() {
    this.generation++;
    if (this.searching) this.send("stop");
  }

  terminate() {
    this.disposed = true;
    this.listeners.clear();
    this.worker.terminate();
  }
}

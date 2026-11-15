# 🦉 OWLChess — Hybrid AI Chess Trainer

**Live Production App:** [https://owlchess.vercel.app](https://owlchess.vercel.app)

**OWLChess** is a web-based chess training partner built on a hybrid **"Engine + Deterministic Code + Fast LLM"** architecture. Because general-purpose LLMs hallucinate chess board states and tactics when left alone, OWLChess delegates 100% of move calculation, evaluation shifts, and tactical motif detection to **Stockfish 19 (WASM)** and **`chessops` bitboards**, using a fast streamed LLM (`gemini-3.5-flash-lite` or the built-in deterministic coach engine) strictly as a translator to turn verified chess facts into plain-English coaching explanations in under 5 seconds.

---

## ✨ Key Features

1. **Adjustable Stockfish 19 Opponent (`1320` to `3190+` Elo)**
   - Runs two independent **Stockfish 19 (`stockfish-19-lite-single.wasm`)** Web Workers directly in the browser with zero server latency.
   - Dial the opponent's playing strength anywhere from `1320` to `3190` Elo via `UCI_LimitStrength` + `UCI_Elo`, or toggle **MAX** for unthrottled engine play.
2. **Continuous MultiPV=3 Live Analysis & Move Grading**
   - A dedicated analysis worker evaluates every position with `MultiPV = 3`, updating a Lichess-style win-probability **Eval Bar** and grading every move (`★ Best`, `✓ Solid`, `?! Inaccuracy`, `? Mistake`, `?? Blunder`) using Lichess win-probability loss thresholds.
3. **Deterministic Tactical Motif Detector (`chessops`)**
   - Inspects bitboards, attack maps (`attacks`, `kingAttackers`), and sliding rays (`ray`, `between`) in `<5ms` to deterministically flag:
     - **Fork** (moved piece simultaneously attacks 2+ higher-value, king, or undefended enemy pieces)
     - **Pin** (absolute pins to the King and relative pins to the Queen/Rook)
     - **Skewer** (sliding attack through a high-value piece to a piece behind it)
     - **Discovered Check & Discovered Attack** (moving a piece unblocks a friendly rook, bishop, or queen)
     - **Zwischenzug** (playing an in-between check or high-priority counter-threat before an expected recapture or retreat)
     - **Hanging Piece & Captures Hanging Piece**, **Double Check**, **Promotion**, **Castling**, and **Center Control**
   - Draws colored tactical arrows directly on the `chessground` board so you can visually trace every fork, pin, skewer, or discovered attack.
4. **Historical Master Games & ECO Opening Lookup**
   - Queries the **Lichess Masters Opening Explorer API** (`explorer.lichess.ovh/masters`) in parallel via `/api/masters` with server-side caching and a built-in curated grandmaster opening book fallback (Kasparov vs. Topalov 1999, Fischer vs. Spassky 1972, Karpov vs. Kasparov 1985, Morphy's Opera Game, Deep Blue vs. Kasparov 1997, etc.).
5. **Under-5s Streamed AI Coach Card**
   - Streams a structured 3-part breakdown (**1. Move & Tactic**, **2. Why It Matters**, **3. Master Game Context**) into the OWLChess speech-bubble card.
   - Supports live **Gemini 3.5 Flash-Lite** streaming (`thinkingBudget: 0` for sub-second time-to-first-token) via `GEMINI_API_KEY` or the in-app **API Key** input, and works out-of-the-box with zero configuration using the built-in deterministic coach synthesizer.

---

## 🏗️ Pipeline Architecture

Every time a move lands on the board, three deterministic stages run in parallel before streaming the grounded coaching card:

```text
User / Stockfish 19 Plays Move
 │
 ├──► [Parallel 1: ~850ms] Stockfish 19 Analysis Worker (MultiPV=3)
 │      └─► Eval shift (+0.20 → -3.40), Best Move, Principal Variation (PV)
 │
 ├──► [Parallel 2: ~100ms] /api/masters (Lichess Masters API + Curated Book)
 │      └─► ECO Code, Opening Name, Top 3 Historical Grandmaster Games
 │
 └──► [Parallel 3: <5ms]  chessops Bitboard Motif Detector (src/lib/motifs.ts)
        └─► Verified Tags (e.g. ["Zwischenzug", "Fork", "Check"]) + Board Arrows
                │
                ▼
      [Streamed Response: /api/coach]
        └─► Gemini 3.5 Flash-Lite (or Deterministic Coach Engine)
            streams 3-part breakdown to the OWLChess Speech Bubble in <2.5s total
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.4 (App Router, React 19, TypeScript) |
| **Board UI** | `chessground` (Lichess board) + `chess.js` + Tailwind CSS v4 |
| **Chess Engine** | `stockfish` v19.0.1 (`stockfish-19-lite-single.wasm` in Web Workers) |
| **Tactical Bitboards** | `chessops` (attack maps, sliding rays, pins, skewers, forks, zwischenzugs) |
| **Master Games API** | Lichess Opening Explorer (`explorer.lichess.ovh/masters`) + curated ECO book |
| **AI Coach** | `gemini-3.5-flash-lite` (SSE streaming) + deterministic grounded fallback |
| **Testing** | Vitest (`37` unit & real Stockfish WASM integration tests) |

---

## 🚀 Getting Started Locally

### 1. Install Dependencies

```bash
npm install
```

> `postinstall` automatically runs `scripts/copy-engine.mjs` to copy `stockfish-19-lite-single.js` and `stockfish-19-lite-single.wasm` into `public/stockfish/`.

### 2. Configure Environment Variables (Optional)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

- `GEMINI_API_KEY` *(optional)*: Enables live `gemini-3.5-flash-lite` streaming in `/api/coach`. You can also paste a key directly in the UI via the **API Key** button. If omitted, the built-in deterministic coach engine is used automatically.
- `LICHESS_API_TOKEN` *(optional)*: Personal Lichess API token for higher rate limits on `explorer.lichess.ovh/masters`.

> **Security Note:** `.gitignore` strictly ignores `.env`, `.env.local`, and `.env*.local` so API keys are never committed to version control.

### 3. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running the Test Suite

Run all 37 unit and integration tests via Vitest:

```bash
npm test
```

- `src/lib/uci.test.ts` (13 tests): UCI `info`/`bestmove`/`option` parsing, White-POV score conversion, Lichess win-probability math, Elo clamping.
- `src/lib/classify.test.ts` (6 tests): Move quality classification (`best`, `good`, `inaccuracy`, `mistake`, `blunder`).
- `src/lib/motifs.test.ts` (7 tests): Deterministic detection of forks, absolute pins, skewers, discovered checks, zwischenzugs, hanging pieces, and center control.
- `src/lib/openings.test.ts` (3 tests): FEN key normalization, curated opening book matching, and Lichess Masters payload parsing.
- `src/lib/coach.test.ts` (3 tests): Grounded LLM prompt construction and deterministic 3-part coaching synthesis.
- `src/lib/engine.integration.test.ts` (5 tests): End-to-end integration tests driving the real **Stockfish 19 WASM** engine (MultiPV search, mate-in-1 detection, search superseding, and `UCI_Elo` strength limiting).

---

## 🌐 Deployment (Vercel)

This project is deployed to production on Vercel at **[https://owlchess.vercel.app](https://owlchess.vercel.app)**.

To deploy from the CLI:

```bash
vercel deploy --prod
```

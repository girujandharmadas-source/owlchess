"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";

export interface BoardProps {
  config: Config;
  shapes?: DrawShape[];
  onMove: (from: Key, to: Key) => void;
}

/** React wrapper around Lichess's chessground. Creates the board once and patches config. */
export default function Board({ config, shapes = [], onMove }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.set({
      ...config,
      movable: {
        ...config.movable,
        events: { after: (from, to) => onMoveRef.current(from, to) },
      },
    });
  }, [config]);

  useEffect(() => {
    api.current?.setAutoShapes(shapes);
  }, [shapes]);

  return <div ref={el} className="cg-board-host" />;
}

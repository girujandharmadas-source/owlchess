"use client";

import { useCallback, useRef, useState } from "react";
import jsQR from "jsqr";
import { QRCodeCanvas } from "qrcode.react";
import {
  type SessionPayload,
  buildSessionShareUrl,
  formatQrDownloadFilename,
  importSessionFromHash,
} from "@/lib/session";

interface SaveModalProps {
  payload: SessionPayload;
  onClose: () => void;
}

export function SaveSessionModal({ payload, onClose }: SaveModalProps) {
  const qrWrapperRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = buildSessionShareUrl(payload);
  const filename = formatQrDownloadFilename();

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback copy
      const input = document.createElement("textarea");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  }, [shareUrl]);

  const handleDownloadQr = useCallback(() => {
    const canvas = qrWrapperRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filename]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-[#221d31] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="save-modal-title" className="text-lg font-extrabold tracking-tight text-white">
              Save &amp; Share Session
            </h2>
            <p className="mt-0.5 text-xs text-neutral-300">
              Scan this QR code or copy the Magic Link to resume your board, move history, and Glicko-2 rating on any device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/20"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Live Scannable QR Code */}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#181424] p-4">
          <div
            ref={qrWrapperRef}
            className="rounded-xl bg-white p-2.5 shadow-lg"
          >
            <QRCodeCanvas
              value={shareUrl}
              size={220}
              level="M"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#181424"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-neutral-300">
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              Rating: {payload.playerProfile.rating} ± {payload.playerProfile.rd}
            </span>
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              Moves: {payload.currentGame.moves.length}
            </span>
            <span className="rounded-full bg-[#352f49] px-2.5 py-0.5 font-mono">
              Bot: {payload.currentGame.opponentElo} Elo
            </span>
          </div>
        </div>

        {/* Magic Link Preview */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Magic Resume Link
          </label>
          <input
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-white/15 bg-[#161220] px-3 py-2 font-mono text-xs text-neutral-200 focus:border-[#ee66b7] focus:outline-none"
          />
        </div>

        {/* Actions: Download QR PNG + Copy Resume Link */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownloadQr}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-[#352f49] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#433b5c]"
          >
            <span>⬇ Download QR Code</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="owlchess-btn-primary flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide"
          >
            <span>{copied ? "✓ Link Copied!" : "🔗 Copy Resume Link"}</span>
          </button>
        </div>

        <p className="text-center font-mono text-[11px] text-neutral-400">
          Downloads as <span className="text-neutral-200">{filename}</span>
        </p>
      </div>
    </div>
  );
}

interface ResumeModalProps {
  onRestore: (payload: SessionPayload) => void;
  onClose: () => void;
}

export function ResumeSessionModal({ onRestore, onClose }: ResumeModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  const decodeQrImageFile = useCallback(
    (file: File) => {
      setErrorMsg(null);
      setDecoding(true);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        if (!dataUrl) {
          setDecoding(false);
          setErrorMsg("Could not read image file.");
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setDecoding(false);
            setErrorMsg("Canvas context unavailable in this browser.");
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          setDecoding(false);
          if (!code?.data) {
            setErrorMsg("No scannable QR code found in that image. Try a clearer QR screenshot or paste the Magic Link below.");
            return;
          }
          const parsed = importSessionFromHash(code.data);
          if (!parsed) {
            setErrorMsg("QR code was read, but it does not contain a valid OWLChess session.");
            return;
          }
          onRestore(parsed);
        };
        img.onerror = () => {
          setDecoding(false);
          setErrorMsg("Unsupported image format. Please upload a PNG or JPG QR image.");
        };
        img.src = dataUrl;
      };
      reader.onerror = () => {
        setDecoding(false);
        setErrorMsg("Failed to read file.");
      };
      reader.readAsDataURL(file);
    },
    [onRestore],
  );

  const handleManualRestore = useCallback(() => {
    setErrorMsg(null);
    const parsed = importSessionFromHash(linkInput);
    if (!parsed) {
      setErrorMsg("Invalid Magic Link or session hash. Please paste a complete OWLChess resume link.");
      return;
    }
    onRestore(parsed);
  }, [linkInput, onRestore]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-modal-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-[#221d31] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="resume-modal-title" className="text-lg font-extrabold tracking-tight text-white">
              Resume Saved Session
            </h2>
            <p className="mt-0.5 text-xs text-neutral-300">
              Drop a saved OWLChess QR code image or paste your Magic Link to restore your game and Glicko-2 rating.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200 transition hover:bg-white/20"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Upload QR Image Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) decodeQrImageFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${
            dragActive
              ? "border-[#ee66b7] bg-[#df3ca9]/15"
              : "border-white/20 bg-[#181424]/80 hover:border-[#ee66b7]/60 hover:bg-[#181424]"
          }`}
        >
          <span className="text-2xl">📷</span>
          <p className="text-xs font-bold text-white">
            {decoding ? "Scanning QR Code…" : "Upload QR Image (Drag & Drop or Click to Browse)"}
          </p>
          <p className="text-[11px] text-neutral-400">
            Supports saved <span className="font-mono text-neutral-300">owlchess-save-YYYY-MM-DD.png</span> or screenshots
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) decodeQrImageFile(file);
            }}
            className="hidden"
          />
        </div>

        {/* Manual Magic Link / Hash Input */}
        <div className="space-y-2 border-t border-white/10 pt-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Or Paste Magic Link / Session Hash
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://owlchess.vercel.app/#save=..."
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#161220] px-3 py-2 font-mono text-xs text-white placeholder-neutral-500 focus:border-[#ee66b7] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleManualRestore}
              disabled={!linkInput.trim()}
              className="owlchess-btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-bold tracking-wide disabled:opacity-40"
            >
              Restore
            </button>
          </div>
        </div>

        {errorMsg && (
          <p
            role="alert"
            className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200"
          >
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}

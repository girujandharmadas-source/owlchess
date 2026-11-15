import {
  type CoachPayload,
  buildCoachPrompt,
  buildGroundedCoachExplanation,
} from "@/lib/coach";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

function streamTextAsResponse(text: string, engineHeader: string): Response {
  const encoder = new TextEncoder();
  const words = text.split(/(?<=\s)/);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < words.length; i += 3) {
        controller.enqueue(encoder.encode(words.slice(i, i + 3).join("")));
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Coach-Engine": engineHeader,
    },
  });
}

export async function POST(req: Request) {
  let body: { payload?: CoachPayload; apiKey?: string };
  try {
    body = (await req.json()) as { payload?: CoachPayload; apiKey?: string };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payload = body.payload;
  if (!payload || !payload.san) {
    return new Response("Missing coach payload", { status: 400 });
  }

  const apiKey =
    body.apiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    return streamTextAsResponse(buildGroundedCoachExplanation(payload), "deterministic-coach");
  }

  try {
    const prompt = buildCoachPrompt(payload);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 220,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(4200),
    });

    if (!upstream.ok || !upstream.body) {
      return streamTextAsResponse(buildGroundedCoachExplanation(payload), "deterministic-fallback");
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        let emittedAny = false;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr) as {
                  candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                  }>;
                };
                const chunk =
                  parsed.candidates?.[0]?.content?.parts
                    ?.map((p) => p.text ?? "")
                    .join("") ?? "";
                if (chunk) {
                  emittedAny = true;
                  controller.enqueue(encoder.encode(chunk));
                }
              } catch {
                // ignore malformed SSE frame
              }
            }
          }
        } catch {
          // stream interrupted
        } finally {
          if (!emittedAny) {
            controller.enqueue(encoder.encode(buildGroundedCoachExplanation(payload)));
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Coach-Engine": model,
      },
    });
  } catch {
    return streamTextAsResponse(buildGroundedCoachExplanation(payload), "deterministic-fallback");
  }
}

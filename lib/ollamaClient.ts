import http from "node:http";
import https from "node:https";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

/**
 * POST JSON ke Ollama tanpa batas waktu.
 * `fetch` bawaan Node (undici) memutus request bila header respon belum datang dalam 300 detik,
 * padahal generate panjang/antrean Ollama bisa lebih lama dari itu ("fetch failed").
 */
export function ollamaPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const url = new URL(path, OLLAMA_URL);
  const payload = JSON.stringify(body);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise<T>((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Ollama error (${res.statusCode}): ${text.slice(0, 500)}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error(`Respon Ollama bukan JSON: ${text.slice(0, 300)}`));
          }
        });
        res.on("error", reject);
      }
    );
    req.on("error", (e) => reject(new Error(`Tidak bisa menghubungi Ollama di ${OLLAMA_URL}: ${e.message}`)));
    req.setTimeout(0); // tanpa batas waktu
    req.write(payload);
    req.end();
  });
}

const QWEN_MODEL = process.env.QWEN_MODEL || "qwen3:8b";

/** Panggil Qwen via /api/chat dengan keluaran JSON sesuai schema; mengembalikan teks JSON mentah */
export async function qwenChatJSON(
  system: string,
  user: string,
  schema: object,
  options: { temperature?: number; maxTokens?: number; numCtx?: number } = {}
): Promise<string> {
  const json = await ollamaPost<{ message?: { content?: string } }>("/api/chat", {
    model: QWEN_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    format: schema,
    stream: false,
    think: false,
    options: {
      temperature: options.temperature ?? 0.3,
      num_predict: options.maxTokens ?? 600,
      num_ctx: options.numCtx ?? 8192,
    },
  });
  return json.message?.content || "";
}

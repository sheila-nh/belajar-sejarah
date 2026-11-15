import fs from "fs";
import pdfParse from "pdf-parse";

export async function parsePDF(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

export function splitIntoChunks(
  text: string,
  chunkSize = 1000,
  overlap = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
  }

  return chunks.filter((c) => c.length > 50);
}

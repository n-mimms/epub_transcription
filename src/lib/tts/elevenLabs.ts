import fs from "fs";
import path from "path";
import { elevenLabsTextFromSpeech } from "@/lib/dialogueDelivery";
import type { DialogueSynthJob } from "@/lib/tts/types";

export function resolveElevenLabsApiKey(): string {
  const key = (process.env.ELEVEN_LABS ?? process.env.ELEVEN_LABS_API_KEY ?? "").trim();
  if (!key) {
    throw new Error("Set ELEVEN_LABS (or ELEVEN_LABS_API_KEY) in the environment or .env");
  }
  return key;
}

export async function synthesizeElevenLabsMp3(
  job: DialogueSynthJob,
  voiceId: string,
  modelId: string,
): Promise<void> {
  const apiKey = resolveElevenLabsApiKey();
  const text = elevenLabsTextFromSpeech(job.speech, job.delivery);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      output_format: "mp3_22050_32",
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs ${res.status} for ${job.epubHref}: ${errBody.slice(0, 400)}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(job.diskPath), { recursive: true });
  fs.writeFileSync(job.diskPath, bytes);
}

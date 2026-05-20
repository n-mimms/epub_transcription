import fs from "fs";
import path from "path";
import { PollyClient, SynthesizeSpeechCommand, type Engine } from "@aws-sdk/client-polly";
import { pollySsmlFromSpeech } from "@/lib/dialogueDelivery";
import type { DialogueSynthJob } from "@/lib/tts/types";

export function createPollyClient(): PollyClient {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_REGION) {
    throw new Error("Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION for Polly synthesis");
  }
  return new PollyClient({ region: process.env.AWS_REGION });
}

export async function synthesizePollyMp3(
  client: PollyClient,
  job: DialogueSynthJob,
  voiceId: string,
  engine: string,
): Promise<void> {
  const ssml = pollySsmlFromSpeech(job.speech, job.delivery);
  const res = await client.send(
    new SynthesizeSpeechCommand({
      Text: ssml,
      TextType: "ssml",
      OutputFormat: "mp3",
      VoiceId: voiceId,
      Engine: engine as Engine,
      SampleRate: "22050",
    }),
  );
  if (!res.AudioStream) throw new Error(`Polly returned no audio for ${job.epubHref}`);
  const bytes = await res.AudioStream.transformToByteArray();
  fs.mkdirSync(path.dirname(job.diskPath), { recursive: true });
  fs.writeFileSync(job.diskPath, Buffer.from(bytes));
}

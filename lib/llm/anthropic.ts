import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export async function* streamAnthropic(
  prompt: string,
  model = ANTHROPIC_DEFAULT_MODEL
): AsyncGenerator<string> {
  const anthropic = getClient();

  const stream = await anthropic.messages.stream({
    model,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}

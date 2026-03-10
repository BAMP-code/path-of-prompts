import Anthropic from "@anthropic-ai/sdk";

let defaultClient: Anthropic | null = null;

function getClient(apiKey?: string): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey });
  }
  if (!defaultClient) {
    defaultClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return defaultClient;
}

export const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export async function* streamAnthropic(
  prompt: string,
  model = ANTHROPIC_DEFAULT_MODEL,
  apiKey?: string
): AsyncGenerator<string> {
  const anthropic = getClient(apiKey);

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

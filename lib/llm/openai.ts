import OpenAI from "openai";

let defaultClient: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  if (apiKey) {
    return new OpenAI({ apiKey });
  }
  if (!defaultClient) {
    defaultClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return defaultClient;
}

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export async function* streamOpenAI(
  prompt: string,
  model = OPENAI_DEFAULT_MODEL,
  apiKey?: string
): AsyncGenerator<string> {
  const openai = getClient(apiKey);

  const stream = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    max_tokens: 512,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

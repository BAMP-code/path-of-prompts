import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

export async function* streamOpenAI(
  prompt: string,
  model = OPENAI_DEFAULT_MODEL
): AsyncGenerator<string> {
  const openai = getClient();

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

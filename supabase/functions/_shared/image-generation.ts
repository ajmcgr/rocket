import { GeminiUnavailableError, geminiImage } from "./gemini.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_IMAGE_MODEL =
  Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2";
const OPENAI_TIMEOUT_MS = 30_000;

export type ReferenceImage = {
  mimeType: string;
  data: string;
};

export class ImageProviderUnavailableError extends Error {
  provider: string;
  status: number;
  bodyText: string;

  constructor(provider: string, status: number, bodyText: string) {
    super(`${provider} image generation is unavailable`);
    this.name = "ImageProviderUnavailableError";
    this.provider = provider;
    this.status = status;
    this.bodyText = bodyText;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readOpenAIImage(response: Response): Promise<Uint8Array> {
  const bodyText = await response.text();

  if (!response.ok) {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      response.status,
      bodyText.slice(0, 1000),
    );
  }

  let payload: {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      502,
      "OpenAI returned invalid JSON",
    );
  }

  const image = payload.data?.[0];
  if (image?.b64_json) return decodeBase64(image.b64_json);

  if (image?.url) {
    const imageResponse = await fetchWithTimeout(image.url, {
      method: "GET",
    });
    if (!imageResponse.ok) {
      throw new ImageProviderUnavailableError(
        "OpenAI",
        imageResponse.status,
        "OpenAI image download failed",
      );
    }
    return new Uint8Array(await imageResponse.arrayBuffer());
  }

  throw new ImageProviderUnavailableError(
    "OpenAI",
    502,
    "OpenAI returned no image",
  );
}

async function openAIImage(
  prompt: string,
  referenceImages: ReferenceImage[],
): Promise<Uint8Array> {
  if (!OPENAI_API_KEY) {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      503,
      "OPENAI_API_KEY not configured",
    );
  }

  const authorization = `Bearer ${OPENAI_API_KEY}`;

  if (referenceImages.length === 0) {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt,
          size: "1024x1024",
          output_format: "png",
        }),
      },
    );

    return await readOpenAIImage(response);
  }

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("output_format", "png");

  for (const [index, referenceImage] of referenceImages.entries()) {
    form.append(
      "image[]",
      new Blob([decodeBase64(referenceImage.data)], {
        type: referenceImage.mimeType,
      }),
      `reference-${index + 1}.png`,
    );
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/images/edits",
    {
      method: "POST",
      headers: { Authorization: authorization },
      body: form,
    },
  );

  return await readOpenAIImage(response);
}

export async function generateImage(
  prompt: string,
  referenceImages: ReferenceImage[] = [],
): Promise<Uint8Array> {
  if (OPENAI_API_KEY) {
    try {
      return await openAIImage(prompt, referenceImages);
    } catch (error) {
      const status = error instanceof ImageProviderUnavailableError
        ? error.status
        : 503;
      console.warn(
        `OpenAI image generation failed (${status}); using Gemini fallback`,
      );
    }
  }

  try {
    return await geminiImage(prompt, referenceImages);
  } catch (error) {
    if (error instanceof GeminiUnavailableError) {
      throw new ImageProviderUnavailableError(
        "Gemini",
        error.status,
        error.bodyText,
      );
    }

    throw new ImageProviderUnavailableError(
      "Gemini",
      503,
      error instanceof Error ? error.message : "Gemini image generation failed",
    );
  }
}

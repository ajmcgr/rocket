import { APP_CATEGORIES } from "./appCategories.ts";

export function submissionCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    "developer tools": "Engineering & Development", "development": "Engineering & Development",
    "software development": "Engineering & Development", "graphics & design": "Design & Creative",
    "data analysis": "Data analysis tools", "social networking": "Social & Community",
  };
  return APP_CATEGORIES.find(c => c.name.toLowerCase() === key)?.name || aliases[key] || null;
}

export function suggestedSubmissionCategory(source: string, name: string, description: string): string | null {
  if (source === "github") return "Engineering & Development";
  const text = `${name} ${description}`;
  if (/open app platform|app (?:directory|discovery|marketplace)|discover (?:new |useful )?apps/i.test(text)) return "Platforms";
  if (/developer tools|javascript framework|software development/i.test(text)) return "Engineering & Development";
  return null;
}

// Read bounded raster headers without decoding untrusted images or adding an
// image library to the Edge Function. Unsupported artwork stays unselected.
export function submissionImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  let width = 0, height = 0;
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (length < 2 || i + 2 + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        height = (bytes[i + 5] << 8) | bytes[i + 6]; width = (bytes[i + 7] << 8) | bytes[i + 8]; break;
      }
      i += 2 + length;
    }
  } else if (bytes.length >= 30 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") {
    const chunk = new TextDecoder().decode(bytes.slice(12,16));
    if (chunk === "VP8X") {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = (bytes[26] | bytes[27] << 8) & 0x3fff; height = (bytes[28] | bytes[29] << 8) & 0x3fff;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    }
  }
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 8_000_000 ? {width,height} : null;
}

export async function submissionMedia(
  website: string, social: string | null, icons: string[],
  fetchImage: (url: string) => Promise<{url: string; bytes: Uint8Array}>,
) {
  const host = new URL(website).hostname.replace(/^www\./, "");
  const permitted = (value: string) => {
    try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && u.hostname.replace(/^www\./, "") === host; }
    catch { return false; }
  };
  const candidates = [...new Set([...icons.slice(0,6), social].filter((v): v is string => Boolean(v)))];
  const images = await Promise.all(candidates.map(async (url) => {
    if (!permitted(url)) return null;
    try {
      const result = await fetchImage(url);
      const size = submissionImageSize(result.bytes);
      return permitted(result.url) && size ? {url:result.url, original:url, ...size} : null;
    } catch { return null; }
  }));
  const squareIcons = images.filter(i => i && icons.includes(i.original) && i.width === i.height && i.width >= 128);
  squareIcons.sort((a,b) => b!.width - a!.width);
  const hero = images.find(i => i?.original === social && i.width >= 600 && i.height >= 300);
  return {logo_url:squareIcons[0]?.url || null, hero_url:hero?.url || null};
}

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { denoRequest } from "../../supabase/functions/_shared/appIngestion";

const url = new URL("https://example.com/demo?q=1");
function runtime(response: string) {
  const bytes = new TextEncoder().encode(response);
  let offset = 0;
  const conn = {
    close: vi.fn(),
    write: vi.fn(async (data: Uint8Array) => data.length),
    read: vi.fn(async (buffer: Uint8Array) => {
      if (offset === bytes.length) return null;
      const length = Math.min(buffer.length, bytes.length - offset);
      buffer.set(bytes.subarray(offset, offset + length));
      offset += length;
      return length;
    }),
  };
  const connect = vi.fn(async () => conn);
  const startTls = vi.fn(async () => conn);
  vi.stubGlobal("Deno", { connect, startTls });
  return { conn, connect, startTls };
}
afterEach(() => vi.unstubAllGlobals());
describe("pinned Edge Runtime HTTP transport", () => {
  it("pins the vetted IP, verifies TLS with the original hostname, and closes its socket", async () => {
    const mock = runtime(
      "HTTP/1.1 200 OK\r\nContent-Length: 5\r\nContent-Type: text/html\r\n\r\nhello",
    );
    const result = await denoRequest(url, "93.184.216.34", 10);
    expect(mock.connect).toHaveBeenCalledWith({
      hostname: "93.184.216.34",
      port: 443,
    });
    expect(mock.startTls).toHaveBeenCalledWith(mock.conn, {
      hostname: "example.com",
    });
    expect(
      new TextDecoder().decode(mock.conn.write.mock.calls[0][0]),
    ).toContain("Host: example.com\r\n");
    expect(new TextDecoder().decode(result.bytes)).toBe("hello");
    expect(mock.conn.close).toHaveBeenCalled();
  });
  it("decodes chunked bodies and rejects oversized decoded data", async () => {
    const response =
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n";
    runtime(response);
    expect(
      new TextDecoder().decode(
        (await denoRequest(url, "93.184.216.34", 20)).bytes,
      ),
    ).toBe("hello world");
    runtime(response);
    await expect(denoRequest(url, "93.184.216.34", 5)).rejects.toThrow(
      "too large",
    );
  });
  it("rejects truncated and malformed response bodies", async () => {
    for (const response of [
      "HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\nhello",
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nX\r\nhello\r\n0\r\n\r\n",
    ]) {
      const mock = runtime(response);
      await expect(denoRequest(url, "93.184.216.34", 100)).rejects.toThrow();
      expect(mock.conn.close).toHaveBeenCalled();
    }
  });
});

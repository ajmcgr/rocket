// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { denoRequest } from "../../supabase/functions/_shared/appIngestion";

const url = new URL("https://example.com/demo?q=1");
function runtime(response: string, endError?: Error, packetSize = 16384) {
  const bytes = new TextEncoder().encode(response);
  let offset = 0;
  const conn = {
    close: vi.fn(),
    write: vi.fn(async (data: Uint8Array) => data.length),
    read: vi.fn(async (buffer: Uint8Array) => {
      if (offset === bytes.length) {
        if (endError) throw endError;
        return null;
      }
      const length = Math.min(packetSize, buffer.length, bytes.length - offset);
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
  it.each([1, 16384])(
    "accepts fully framed responses without reading a broken TLS shutdown (packet size %i)",
    async (packetSize) => {
      const error = new Error(
        "peer closed connection without sending TLS close_notify: https://docs.rs/rustls/latest/rustls/manual/_03_howto/index.html#unexpected-eof",
      );
      for (const response of [
        "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello",
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n",
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5;ext=value\r\nhello\r\n0\r\nX-End: yes\r\n\r\n",
      ]) {
        const mock = runtime(response, error, packetSize);
        expect(
          new TextDecoder().decode(
            (await denoRequest(url, "93.184.216.34", 100)).bytes,
          ),
        ).toBe("hello");
        expect(mock.conn.close).toHaveBeenCalled();
      }
    },
  );
  it("rejects truncated and unframed TLS responses with a usable message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const response of [
        "HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\nhello",
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n",
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n",
        "HTTP/1.1 200 OK\r\n\r\nhello",
      ]) {
        const mock = runtime(
          response,
          new Error("peer closed connection without sending TLS close_notify"),
        );
        await expect(denoRequest(url, "93.184.216.34", 100)).rejects.toThrow(
          "Try again, or add the app details manually",
        );
        expect(mock.conn.close).toHaveBeenCalled();
      }
    } finally {
      warn.mockRestore();
    }
  });
  it("requires the final chunk and complete trailers even after clean EOF", async () => {
    for (const tail of ["", "0\r\n", "0\r\nX-End: yes\r\n"]) {
      runtime(
        `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n${tail}`,
      );
      await expect(denoRequest(url, "93.184.216.34", 100)).rejects.toThrow(
        "Truncated website response",
      );
    }
  });
  it("rejects ambiguous or invalid framing", async () => {
    for (const headers of [
      "Content-Length: 5\r\nContent-Length: 6",
      "Content-Length: -1",
      "Transfer-Encoding: chunked\r\nContent-Length: 5",
      "Transfer-Encoding: gzip",
    ]) {
      runtime(`HTTP/1.1 200 OK\r\n${headers}\r\n\r\nhello`);
      await expect(denoRequest(url, "93.184.216.34", 100)).rejects.toThrow();
    }
  });
});

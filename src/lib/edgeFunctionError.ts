// The SDK stores non-2xx response bodies on error.context, not on data.
export async function edgeFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === "function") {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error.slice(0, 500);
    } catch { /* Empty/non-JSON gateway responses must still show a useful error. */ }
    return `${fallback} (HTTP ${context.status}). Please retry.`;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

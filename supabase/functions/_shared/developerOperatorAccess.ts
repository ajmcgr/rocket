// Both permissions are server-derived. Fail closed on RPC errors or malformed responses.
export async function canInviteDeveloper(
  operator: boolean,
  checkAdmin: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<boolean> {
  if (!operator) return false;
  try {
    const { data, error } = await checkAdmin();
    return !error && data === true;
  } catch {
    return false;
  }
}

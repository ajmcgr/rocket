export const CONTACT_TOPICS = [
  "General question",
  "App listing or claim",
  "Account or billing",
  "Partnership",
] as const;

export type ContactMessage = {
  name: string;
  email: string;
  topic: typeof CONTACT_TOPICS[number];
  message: string;
};

export function validateContactMessage(value: unknown): ContactMessage | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || typeof input.email !== "string" || typeof input.message !== "string") return null;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim();
  if (name.length < 1 || name.length > 100 || /[\r\n]/.test(name)) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) return null;
  if (message.length < 10 || message.length > 4000) return null;
  if (!CONTACT_TOPICS.includes(input.topic as ContactMessage["topic"])) return null;
  return { name, email, topic: input.topic as ContactMessage["topic"], message };
}

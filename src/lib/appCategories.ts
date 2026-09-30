// Existing Launch taxonomy stays intact. These are founder-selectable labels;
// a new label only enters the public catalogue after a real app uses it.
export const APP_CATEGORIES = [
  { name: "Productivity", emoji: "🗓️" },
  { name: "AI Agents", emoji: "🤖" },
  { name: "Marketing & Sales", emoji: "📣" },
  { name: "Design & Creative", emoji: "🎨" },
  { name: "Platforms", emoji: "🧩" },
  { name: "Social & Community", emoji: "💬" },
  { name: "Engineering & Development", emoji: "🛠️" },
  { name: "Data analysis tools", emoji: "📊" },
  { name: "Finance", emoji: "💰" },
  { name: "LLMs", emoji: "🧠" },
  { name: "Health & Fitness", emoji: "🏃" },
  { name: "Ecommerce", emoji: "🛒" },
  { name: "No-code Platforms", emoji: "🧱" },
  { name: "Voice AI Tools", emoji: "🎙️" },
  { name: "Video", emoji: "🎬" },
  { name: "Web3", emoji: "🔗" },
  { name: "Travel", emoji: "✈️" },
  { name: "Product add-ons", emoji: "🧩" },
  { name: "Physical Products", emoji: "📦" },
  { name: "SaaS", emoji: "☁️" },
  // Distinct Apple-inspired categories useful for web apps. Synonyms such as
  // Graphics & Design and Developer Tools are intentionally not duplicated.
  { name: "Books", emoji: "📚" },
  { name: "Business", emoji: "💼" },
  { name: "Education", emoji: "🎓" },
  { name: "Entertainment", emoji: "🎭" },
  { name: "Food & Drink", emoji: "🍽️" },
  { name: "Kids", emoji: "🧸" },
  { name: "Lifestyle", emoji: "🌿" },
  { name: "Medical", emoji: "🩺" },
  { name: "Music", emoji: "🎵" },
  { name: "Navigation", emoji: "🧭" },
  { name: "News", emoji: "📰" },
  { name: "Photo & Video", emoji: "📸" },
  { name: "Reference", emoji: "📖" },
  { name: "Shopping", emoji: "🛍️" },
  { name: "Sports", emoji: "🏀" },
  { name: "Utilities", emoji: "🧰" },
  { name: "Weather", emoji: "🌤️" },
] as const;

export const categoryEmoji = (name: string) =>
  APP_CATEGORIES.find((category) => category.name === name)?.emoji || "📱";

export const availableCategories = (names: string[]) =>
  Array.from(new Set([...APP_CATEGORIES.map(({ name }) => name), ...names]));

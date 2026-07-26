// Icon-based logo templates for /templates.
// Each is rendered as an inline SVG data URL so the existing image renderer
// picks them up (no editor_state.kind === "logotype" here).

type IconKind =
  | "circle" | "ring" | "dot-grid" | "square" | "rounded-square"
  | "triangle" | "diamond" | "hexagon" | "star" | "spark"
  | "bolt" | "leaf" | "arrow-up" | "arrow-right" | "waves"
  | "orbit" | "cross" | "chevron" | "moon" | "sun"
  | "shield" | "heart" | "flame" | "gear" | "cube"
  | "mountain" | "eye" | "chat" | "cloud" | "wifi";

type IconSpec = {
  name: string;
  tagline?: string;
  style: string; // TEMPLATE_STYLES value
  icon: IconKind;
  font: string;
  weight: number;
  letterSpacing?: number; // em
  transform?: "none" | "uppercase" | "lowercase";
  color: string;
  bg: string;
  layout?: "left" | "stack"; // icon-left or icon-on-top
};

const SEEDS: IconSpec[] = [
  // Startup / SaaS
  { name: "Northwind", tagline: "Ship faster", style: "Startup", icon: "arrow-up", font: "Inter", weight: 700, letterSpacing: -0.02, color: "#0F172A", bg: "#F8FAFC" },
  { name: "Loop", tagline: "Work in cycles", style: "Startup", icon: "ring", font: "Space Grotesk", weight: 700, letterSpacing: -0.02, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Kernel", tagline: "The core layer", style: "Startup", icon: "dot-grid", font: "Geist", weight: 700, color: "#0B0B0B", bg: "#FFFFFF" },
  { name: "Nova", tagline: "Bright by default", style: "Startup", icon: "spark", font: "Sora", weight: 700, color: "#FFFFFF", bg: "#1D4ED8" },
  { name: "Foundry", tagline: "Build the next thing", style: "Startup", icon: "cube", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#111827", bg: "#FDE68A" },
  { name: "Momentum", tagline: "Keep shipping", style: "Startup", icon: "chevron", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#0EA5E9" },
  { name: "Signal", tagline: "Cut through noise", style: "Startup", icon: "waves", font: "Figtree", weight: 700, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Anchor", tagline: "Steady growth", style: "Startup", icon: "shield", font: "Plus Jakarta Sans", weight: 700, color: "#FFFFFF", bg: "#065F46" },
  { name: "Rally", tagline: "Move as one", style: "Startup", icon: "arrow-right", font: "Onest", weight: 700, color: "#0A0A0A", bg: "#FFFFFF" },
  { name: "Vector", tagline: "Direction and speed", style: "Startup", icon: "triangle", font: "Space Grotesk", weight: 700, color: "#FFFFFF", bg: "#111827" },

  // AI
  { name: "Neuron", tagline: "Think in patterns", style: "AI", icon: "orbit", font: "Sora", weight: 700, color: "#0B0B0B", bg: "#F5F5F5" },
  { name: "Synapse", tagline: "Connected intelligence", style: "AI", icon: "dot-grid", font: "Space Grotesk", weight: 700, color: "#FFFFFF", bg: "#111827" },
  { name: "Cortex", tagline: "Model your world", style: "AI", icon: "hexagon", font: "Geist", weight: 700, letterSpacing: -0.02, color: "#0F172A", bg: "#EEF2FF" },
  { name: "Prism AI", tagline: "Split the signal", style: "AI", icon: "triangle", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#7C3AED" },
  { name: "Lucid", tagline: "See it clearly", style: "AI", icon: "eye", font: "Figtree", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Aegis", tagline: "Guarded intelligence", style: "AI", icon: "shield", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Delphi", tagline: "Ask anything", style: "AI", icon: "chat", font: "Fraunces", weight: 600, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Muse", tagline: "Creativity, augmented", style: "AI", icon: "spark", font: "Instrument Serif", weight: 400, color: "#0F172A", bg: "#FBCFE8" },
  { name: "Beacon", tagline: "Guided by data", style: "AI", icon: "sun", font: "Sora", weight: 700, color: "#0F172A", bg: "#FEF08A" },
  { name: "Oracle Lab", tagline: "Predict, then act", style: "AI", icon: "orbit", font: "Space Grotesk", weight: 700, color: "#FFFFFF", bg: "#312E81" },

  // Fintech
  { name: "Ledger", tagline: "Money, made simple", style: "Fintech", icon: "square", font: "Inter", weight: 700, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Vault", tagline: "Own your assets", style: "Fintech", icon: "shield", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#0F172A", bg: "#F5F5F4" },
  { name: "Mint", tagline: "Fresh finance", style: "Fintech", icon: "leaf", font: "DM Sans", weight: 700, color: "#065F46", bg: "#ECFDF5" },
  { name: "Pivot", tagline: "Turn the corner", style: "Fintech", icon: "chevron", font: "Hanken Grotesk", weight: 700, color: "#FFFFFF", bg: "#1E3A8A" },
  { name: "Bloom", tagline: "Grow with intent", style: "Fintech", icon: "flame", font: "Plus Jakarta Sans", weight: 700, color: "#7C2D12", bg: "#FED7AA" },
  { name: "Coin", tagline: "One tap, done", style: "Fintech", icon: "circle", font: "Manrope", weight: 800, color: "#0F172A", bg: "#FDE68A" },
  { name: "Threshold", tagline: "Cross the line", style: "Fintech", icon: "arrow-right", font: "Space Grotesk", weight: 700, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Rise Pay", tagline: "Money that moves", style: "Fintech", icon: "arrow-up", font: "Figtree", weight: 700, color: "#065F46", bg: "#D1FAE5" },
  { name: "Beacon Bank", tagline: "Light the way", style: "Fintech", icon: "sun", font: "DM Sans", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Meridian", tagline: "North of ordinary", style: "Fintech", icon: "diamond", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#0F172A", bg: "#FAFAF9" },

  // Healthcare
  { name: "Vital", tagline: "Care that carries on", style: "Healthcare", icon: "cross", font: "Fraunces", weight: 600, color: "#FFFFFF", bg: "#DC2626" },
  { name: "Verdant", tagline: "Grow well", style: "Healthcare", icon: "leaf", font: "Spectral", weight: 600, color: "#065F46", bg: "#ECFDF5" },
  { name: "Halcyon", tagline: "Calm, restored", style: "Healthcare", icon: "moon", font: "Figtree", weight: 600, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Meridian Care", tagline: "Care in every line", style: "Healthcare", icon: "heart", font: "Crimson Pro", weight: 600, color: "#7F1D1D", bg: "#FFF1F2" },
  { name: "Ember Med", tagline: "Warmth in medicine", style: "Healthcare", icon: "flame", font: "Fraunces", weight: 600, color: "#FFFFFF", bg: "#EA580C" },
  { name: "Kindred", tagline: "Family-first care", style: "Healthcare", icon: "heart", font: "Figtree", weight: 700, color: "#831843", bg: "#FCE7F3" },
  { name: "Tonic", tagline: "Everyday wellness", style: "Healthcare", icon: "waves", font: "Spectral", weight: 600, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Pulse", tagline: "Feel it move", style: "Healthcare", icon: "heart", font: "Fraunces", weight: 700, color: "#FFFFFF", bg: "#BE123C" },

  // Education
  { name: "Atlas", tagline: "Map your mind", style: "Education", icon: "hexagon", font: "Playfair Display", weight: 700, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Scholar", tagline: "Study, smarter", style: "Education", icon: "square", font: "Instrument Serif", weight: 400, color: "#FFFFFF", bg: "#1E293B" },
  { name: "Lyceum", tagline: "Curiosity meets craft", style: "Education", icon: "diamond", font: "DM Serif Display", weight: 400, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Prism Learn", tagline: "Every angle counts", style: "Education", icon: "triangle", font: "Fraunces", weight: 700, letterSpacing: -0.02, color: "#4C1D95", bg: "#EDE9FE" },
  { name: "Kindling", tagline: "Spark the next class", style: "Education", icon: "flame", font: "Playfair Display", weight: 700, color: "#7C2D12", bg: "#FFF7ED" },
  { name: "Codex", tagline: "Knowledge, indexed", style: "Education", icon: "square", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Compass", tagline: "Find your bearing", style: "Education", icon: "star", font: "Fraunces", weight: 600, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Northstar", tagline: "Guided study", style: "Education", icon: "star", font: "DM Serif Display", weight: 400, color: "#FFFFFF", bg: "#0C4A6E" },

  // Consumer / Lifestyle
  { name: "Ember & Oak", tagline: "Warm goods, well made", style: "Consumer", icon: "flame", font: "Fraunces", weight: 700, color: "#7C2D12", bg: "#FEF3C7" },
  { name: "Field House", tagline: "Made for the outdoors", style: "Consumer", icon: "mountain", font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, color: "#FFFFFF", bg: "#166534" },
  { name: "Wild Honey", tagline: "Sweet, small batch", style: "Consumer", icon: "hexagon", font: "DM Serif Display", weight: 400, color: "#78350F", bg: "#FEF3C7" },
  { name: "Copper", tagline: "Timeless finish", style: "Consumer", icon: "circle", font: "Fraunces", weight: 700, color: "#7C2D12", bg: "#FFEDD5" },
  { name: "Sundry", tagline: "A little of everything", style: "Consumer", icon: "sun", font: "Syne", weight: 700, color: "#0F172A", bg: "#FEF08A" },
  { name: "Field Notes", tagline: "Everyday essentials", style: "Consumer", icon: "leaf", font: "Bricolage Grotesque", weight: 700, color: "#166534", bg: "#F0FDF4" },

  // Enterprise
  { name: "Fortis", tagline: "Enterprise, built strong", style: "Enterprise", icon: "shield", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Meridian OS", tagline: "Operations, unified", style: "Enterprise", icon: "hexagon", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#0F172A", bg: "#F5F5F4" },
  { name: "Ironclad", tagline: "Trusted at scale", style: "Enterprise", icon: "cube", font: "Geist", weight: 700, color: "#FFFFFF", bg: "#1F2937" },
  { name: "Keystone", tagline: "Hold it together", style: "Enterprise", icon: "diamond", font: "Manrope", weight: 800, color: "#0F172A", bg: "#E5E7EB" },

  // Technology
  { name: "Voltage", tagline: "Power, delivered", style: "Technology", icon: "bolt", font: "JetBrains Mono", weight: 700, color: "#FFFFFF", bg: "#0B0B0B" },
  { name: "Circuit", tagline: "Wired for scale", style: "Technology", icon: "dot-grid", font: "IBM Plex Mono", weight: 700, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Cloudline", tagline: "Ship to the edge", style: "Technology", icon: "cloud", font: "Space Grotesk", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Mesh", tagline: "Connect everything", style: "Technology", icon: "wifi", font: "Sora", weight: 700, color: "#FFFFFF", bg: "#0EA5E9" },
  { name: "Gearbox", tagline: "Move the machine", style: "Technology", icon: "gear", font: "IBM Plex Mono", weight: 700, color: "#F8FAFC", bg: "#111827" },
  { name: "Relay", tagline: "Signals, delivered", style: "Technology", icon: "bolt", font: "JetBrains Mono", weight: 700, color: "#0F172A", bg: "#FEF08A" },

  // Modern
  { name: "Arc", tagline: "Curved by design", style: "Modern", icon: "ring", font: "Space Grotesk", weight: 700, letterSpacing: -0.03, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Slate", tagline: "Clean canvas", style: "Modern", icon: "rounded-square", font: "Bricolage Grotesque", weight: 700, color: "#0F172A", bg: "#F1F5F9" },
  { name: "Halo", tagline: "Softly powerful", style: "Modern", icon: "ring", font: "Figtree", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Onset", tagline: "Start something new", style: "Modern", icon: "arrow-right", font: "Onest", weight: 700, color: "#FFFFFF", bg: "#DC2626" },

  // Minimal
  { name: "linea", tagline: "less, but better", style: "Minimal", icon: "square", font: "Geist", weight: 500, letterSpacing: -0.02, transform: "lowercase", color: "#0B0B0B", bg: "#FFFFFF" },
  { name: "form", tagline: "shape of things", style: "Minimal", icon: "circle", font: "IBM Plex Sans", weight: 500, transform: "lowercase", color: "#0B0B0B", bg: "#FAFAFA" },
  { name: "quiet", tagline: "space to think", style: "Minimal", icon: "dot-grid", font: "Space Grotesk", weight: 500, transform: "lowercase", color: "#0F172A", bg: "#FFFFFF" },

  // Luxury
  { name: "MAISON", tagline: "House of craft", style: "Luxury", icon: "diamond", font: "Playfair Display", weight: 500, letterSpacing: 0.06, transform: "uppercase", color: "#111111", bg: "#FFFFFF" },
  { name: "AUREUS", tagline: "Golden standard", style: "Luxury", icon: "star", font: "DM Serif Display", weight: 400, letterSpacing: 0.06, transform: "uppercase", color: "#111111", bg: "#F5E6C8" },
  { name: "NOIR", tagline: "After dark", style: "Luxury", icon: "moon", font: "Fraunces", weight: 500, letterSpacing: 0.04, transform: "uppercase", color: "#F5F5F5", bg: "#0A0A0A" },

  // Additional seeds — Startup / SaaS
  { name: "Cascade", tagline: "Flow forward", style: "Startup", icon: "waves", font: "Manrope", weight: 700, color: "#FFFFFF", bg: "#0369A1" },
  { name: "Pilot", tagline: "Steer the ship", style: "Startup", icon: "arrow-right", font: "Space Grotesk", weight: 700, color: "#0F172A", bg: "#FDE68A" },
  { name: "Cadence", tagline: "Find your rhythm", style: "Startup", icon: "waves", font: "Figtree", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Beam", tagline: "Straight to the point", style: "Startup", icon: "bolt", font: "Onest", weight: 700, color: "#FFFFFF", bg: "#7C3AED" },
  { name: "Prime", tagline: "First in class", style: "Startup", icon: "star", font: "Geist", weight: 700, letterSpacing: -0.02, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Uplift", tagline: "Rise together", style: "Startup", icon: "arrow-up", font: "Plus Jakarta Sans", weight: 700, color: "#065F46", bg: "#D1FAE5" },

  // Additional seeds — AI
  { name: "Sable AI", tagline: "Quiet intelligence", style: "AI", icon: "moon", font: "Sora", weight: 700, color: "#F5F5F5", bg: "#0A0A0A" },
  { name: "Vertex", tagline: "Peak reasoning", style: "AI", icon: "triangle", font: "Space Grotesk", weight: 700, color: "#0F172A", bg: "#F0F9FF" },
  { name: "Halo AI", tagline: "Circle of insight", style: "AI", icon: "ring", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#1E293B" },
  { name: "Kite", tagline: "Ride the model", style: "AI", icon: "diamond", font: "Figtree", weight: 700, color: "#0F172A", bg: "#FBCFE8" },
  { name: "Ember AI", tagline: "Warm the machine", style: "AI", icon: "flame", font: "Fraunces", weight: 600, color: "#FFFFFF", bg: "#B45309" },

  // Additional seeds — Fintech
  { name: "Tally", tagline: "Count what counts", style: "Fintech", icon: "dot-grid", font: "IBM Plex Sans", weight: 700, color: "#0F172A", bg: "#FFFFFF" },
  { name: "Steel", tagline: "Money, hardened", style: "Fintech", icon: "cube", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#F8FAFC", bg: "#1F2937" },
  { name: "Ivy Capital", tagline: "Grow steadily", style: "Fintech", icon: "leaf", font: "Fraunces", weight: 600, color: "#065F46", bg: "#F0FDF4" },
  { name: "Orbit Pay", tagline: "Payments in motion", style: "Fintech", icon: "orbit", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#4338CA" },

  // Additional seeds — Healthcare
  { name: "Clover", tagline: "Lucky health", style: "Healthcare", icon: "leaf", font: "Figtree", weight: 700, color: "#166534", bg: "#DCFCE7" },
  { name: "Serene", tagline: "Peace of mind", style: "Healthcare", icon: "moon", font: "Spectral", weight: 600, color: "#1E3A8A", bg: "#EFF6FF" },
  { name: "Cardia", tagline: "Heart-led care", style: "Healthcare", icon: "heart", font: "Crimson Pro", weight: 600, color: "#FFFFFF", bg: "#9F1239" },
  { name: "Salve", tagline: "Everyday relief", style: "Healthcare", icon: "cross", font: "Fraunces", weight: 600, color: "#0F172A", bg: "#FFFFFF" },

  // Additional seeds — Education
  { name: "Ink & Idea", tagline: "Write to learn", style: "Education", icon: "square", font: "Playfair Display", weight: 700, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Quill", tagline: "Words that stick", style: "Education", icon: "leaf", font: "Fraunces", weight: 600, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Beacon Prep", tagline: "Ready for anything", style: "Education", icon: "sun", font: "DM Serif Display", weight: 400, color: "#0F172A", bg: "#FFFFFF" },

  // Additional seeds — Consumer / Lifestyle
  { name: "Roam", tagline: "Go anywhere", style: "Consumer", icon: "mountain", font: "Bricolage Grotesque", weight: 700, color: "#F8FAFC", bg: "#334155" },
  { name: "Peach", tagline: "Fresh always", style: "Consumer", icon: "circle", font: "Fraunces", weight: 700, color: "#7F1D1D", bg: "#FED7AA" },
  { name: "Harbor", tagline: "Come home", style: "Consumer", icon: "waves", font: "DM Serif Display", weight: 400, color: "#F8FAFC", bg: "#0C4A6E" },

  // Additional seeds — Enterprise
  { name: "Bastion", tagline: "Defense at scale", style: "Enterprise", icon: "shield", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#111827" },
  { name: "Axiom", tagline: "Foundational truth", style: "Enterprise", icon: "cube", font: "IBM Plex Sans", weight: 700, color: "#0F172A", bg: "#E5E7EB" },

  // Additional seeds — Technology
  { name: "Kilowatt", tagline: "Raw compute", style: "Technology", icon: "bolt", font: "JetBrains Mono", weight: 700, color: "#FDE68A", bg: "#0B0B0B" },
  { name: "Nimbus", tagline: "Cloud native", style: "Technology", icon: "cloud", font: "Sora", weight: 700, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Sprocket", tagline: "The right fit", style: "Technology", icon: "gear", font: "IBM Plex Mono", weight: 700, color: "#0F172A", bg: "#FAFAF9" },
  { name: "Uplink", tagline: "Always connected", style: "Technology", icon: "wifi", font: "Space Grotesk", weight: 700, color: "#FFFFFF", bg: "#1E40AF" },

  // Additional seeds — Modern / Minimal / Luxury
  { name: "Fold", tagline: "Layered by design", style: "Modern", icon: "rounded-square", font: "Bricolage Grotesque", weight: 700, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Halcyon Co", tagline: "Modern calm", style: "Modern", icon: "ring", font: "Onest", weight: 700, color: "#F8FAFC", bg: "#0F172A" },
  { name: "orb", tagline: "round is enough", style: "Minimal", icon: "circle", font: "Geist", weight: 500, transform: "lowercase", color: "#0B0B0B", bg: "#FFFFFF" },
  { name: "grid", tagline: "structure first", style: "Minimal", icon: "dot-grid", font: "IBM Plex Mono", weight: 500, transform: "lowercase", color: "#0B0B0B", bg: "#F5F5F5" },
  { name: "REGALIA", tagline: "Signature pieces", style: "Luxury", icon: "star", font: "Playfair Display", weight: 500, letterSpacing: 0.08, transform: "uppercase", color: "#F5E6C8", bg: "#0A0A0A" },
  { name: "OBSIDIAN", tagline: "Sharpened elegance", style: "Luxury", icon: "diamond", font: "DM Serif Display", weight: 400, letterSpacing: 0.08, transform: "uppercase", color: "#F5F5F5", bg: "#111111" },

  // ── Fresh 2026 drop — 50 new templates ─────────────────────────────────
  // Startup / SaaS
  { name: "Stack", style: "Startup", icon: "cube", font: "Geist", weight: 700, letterSpacing: -0.02, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Draft", style: "Startup", icon: "chevron", font: "Space Grotesk", weight: 700, color: "#0F172A", bg: "#FDE68A" },
  { name: "Basecamp Co", style: "Startup", icon: "mountain", font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, color: "#F0FDF4", bg: "#166534" },
  { name: "Relay", style: "Startup", icon: "arrow-right", font: "Onest", weight: 700, color: "#0F172A", bg: "#E0E7FF" },
  { name: "Pilot", style: "Startup", icon: "triangle", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#1D4ED8" },
  { name: "Kite Labs", style: "Startup", icon: "diamond", font: "Figtree", weight: 700, color: "#FFFFFF", bg: "#0EA5E9" },
  { name: "Hangar", style: "Startup", icon: "rounded-square", font: "Plus Jakarta Sans", weight: 700, color: "#0F172A", bg: "#FFF7ED" },

  // AI
  { name: "GLYPH", style: "AI", icon: "hexagon", font: "IBM Plex Mono", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#0F172A", bg: "#F5F5F5" },
  { name: "mira", style: "AI", icon: "eye", font: "Geist", weight: 500, transform: "lowercase", color: "#F5F5F5", bg: "#0B0B0B" },
  { name: "Parable", style: "AI", icon: "chat", font: "Instrument Serif", weight: 400, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Astra AI", style: "AI", icon: "spark", font: "Space Grotesk", weight: 700, letterSpacing: -0.03, color: "#F8FAFC", bg: "#312E81" },
  { name: "Foxglove", style: "AI", icon: "leaf", font: "Fraunces", weight: 600, color: "#4C1D95", bg: "#EDE9FE" },
  { name: "Loop AI", style: "AI", icon: "ring", font: "Sora", weight: 700, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Ember Reason", style: "AI", icon: "flame", font: "Onest", weight: 700, color: "#FFFFFF", bg: "#DC2626" },

  // Fintech
  { name: "Grove Bank", style: "Fintech", icon: "leaf", font: "Fraunces", weight: 600, color: "#065F46", bg: "#F0FDF4" },
  { name: "Bullion", style: "Fintech", icon: "diamond", font: "DM Serif Display", weight: 400, letterSpacing: 0.04, transform: "uppercase", color: "#78350F", bg: "#FEF3C7" },
  { name: "Reserve", style: "Fintech", icon: "shield", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Fable Pay", style: "Fintech", icon: "circle", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#7C3AED" },
  { name: "Pillar", style: "Fintech", icon: "cube", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.04, color: "#0F172A", bg: "#E5E7EB" },
  { name: "Sable Finance", style: "Fintech", icon: "cube", font: "Hanken Grotesk", weight: 700, color: "#F8FAFC", bg: "#1F2937" },

  // Healthcare
  { name: "Fern Health", style: "Healthcare", icon: "leaf", font: "Fraunces", weight: 600, color: "#166534", bg: "#ECFDF5" },
  { name: "Cocoon", style: "Healthcare", icon: "moon", font: "Spectral", weight: 600, color: "#FFFFFF", bg: "#4338CA" },
  { name: "Balm", style: "Healthcare", icon: "cross", font: "Figtree", weight: 700, color: "#7F1D1D", bg: "#FFF1F2" },
  { name: "Willow Care", style: "Healthcare", icon: "waves", font: "Crimson Pro", weight: 600, color: "#0C4A6E", bg: "#E0F2FE" },
  { name: "Bloom Rx", style: "Healthcare", icon: "flame", font: "Fraunces", weight: 600, color: "#FFFFFF", bg: "#EA580C" },

  // Education
  { name: "Marginalia", style: "Education", icon: "square", font: "Playfair Display", weight: 700, color: "#0F172A", bg: "#FEF3C7" },
  { name: "Cursor & Co", style: "Education", icon: "chevron", font: "Instrument Serif", weight: 400, color: "#FFFFFF", bg: "#0F172A" },
  { name: "Studio Athena", style: "Education", icon: "star", font: "DM Serif Display", weight: 400, letterSpacing: 0.04, transform: "uppercase", color: "#0F172A", bg: "#FFFFFF" },
  { name: "Little Scholar", style: "Education", icon: "heart", font: "Fraunces", weight: 700, color: "#831843", bg: "#FCE7F3" },
  { name: "Papyrus", style: "Education", icon: "leaf", font: "Playfair Display", weight: 700, color: "#78350F", bg: "#FEF3C7" },

  // Consumer / Lifestyle
  { name: "Salt & Sage", style: "Consumer", icon: "leaf", font: "Fraunces", weight: 700, color: "#166534", bg: "#F0FDF4" },
  { name: "Nectar", style: "Consumer", icon: "hexagon", font: "DM Serif Display", weight: 400, color: "#78350F", bg: "#FEF3C7" },
  { name: "Rove", style: "Consumer", icon: "mountain", font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, color: "#FDE68A", bg: "#0B0B0B" },
  { name: "Little Field", style: "Consumer", icon: "sun", font: "Fraunces", weight: 600, color: "#0F172A", bg: "#FEF08A" },
  { name: "House of Ember", style: "Consumer", icon: "flame", font: "Playfair Display", weight: 700, letterSpacing: 0.02, color: "#FFF7ED", bg: "#9A3412" },
  { name: "Coastline", style: "Consumer", icon: "waves", font: "Syne", weight: 700, color: "#F8FAFC", bg: "#0C4A6E" },

  // Enterprise
  { name: "MERIDIAN GROUP", style: "Enterprise", icon: "diamond", font: "IBM Plex Sans", weight: 700, transform: "uppercase", letterSpacing: 0.08, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Ledger & Sons", style: "Enterprise", icon: "cube", font: "Fraunces", weight: 600, letterSpacing: 0.02, color: "#0F172A", bg: "#E5E7EB" },
  { name: "Sentinel Ops", style: "Enterprise", icon: "shield", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#0F172A", bg: "#F5F5F4" },
  { name: "GRIDLINE", style: "Enterprise", icon: "dot-grid", font: "Geist", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F8FAFC", bg: "#111827" },

  // Technology
  { name: "Pulsecraft", style: "Technology", icon: "waves", font: "Sora", weight: 700, color: "#0F172A", bg: "#E0F2FE" },
  { name: "Overclock", style: "Technology", icon: "bolt", font: "JetBrains Mono", weight: 700, color: "#F8FAFC", bg: "#111827" },
  { name: "Node & Nest", style: "Technology", icon: "dot-grid", font: "IBM Plex Mono", weight: 700, color: "#0F172A", bg: "#F5F5F5" },
  { name: "Skyline OS", style: "Technology", icon: "cloud", font: "Space Grotesk", weight: 700, letterSpacing: -0.03, color: "#F8FAFC", bg: "#1E40AF" },
  { name: "Circuit Nine", style: "Technology", icon: "gear", font: "Sora", weight: 700, color: "#0F172A", bg: "#FDE68A" },

  // Modern / Minimal / Luxury
  { name: "arc", style: "Minimal", icon: "ring", font: "Geist", weight: 500, transform: "lowercase", color: "#0B0B0B", bg: "#FFFFFF" },
  { name: "form.", style: "Minimal", icon: "square", font: "IBM Plex Sans", weight: 500, transform: "lowercase", color: "#0F172A", bg: "#F5F5F5" },
  { name: "Halcyon Modern", style: "Modern", icon: "diamond", font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, color: "#F8FAFC", bg: "#0F172A" },
  { name: "MAISON NOIR", style: "Luxury", icon: "diamond", font: "Playfair Display", weight: 500, letterSpacing: 0.1, transform: "uppercase", color: "#F5E6C8", bg: "#0A0A0A" },
  { name: "ATELIER", style: "Luxury", icon: "star", font: "DM Serif Display", weight: 400, letterSpacing: 0.12, transform: "uppercase", color: "#0F172A", bg: "#FAF7F2" },

  // ── 2026 refresh drop — 20 additional templates ─────────────────────────
  // Startup / SaaS
  { name: "Zenith", style: "Startup", icon: "triangle", font: "Onest", weight: 700, letterSpacing: -0.02, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Anvil", style: "Startup", icon: "cube", font: "Space Grotesk", weight: 700, color: "#FDE68A", bg: "#111827" },
  { name: "Tangent", style: "Startup", icon: "arrow-up", font: "Manrope", weight: 800, color: "#FFFFFF", bg: "#DB2777" },
  { name: "Lumen", style: "Startup", icon: "sun", font: "Figtree", weight: 700, color: "#0F172A", bg: "#FEF08A" },

  // AI
  { name: "Neura", style: "AI", icon: "orbit", font: "Sora", weight: 700, letterSpacing: -0.03, color: "#F5F5F5", bg: "#4338CA" },
  { name: "Sigil", style: "AI", icon: "hexagon", font: "Geist", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#0F172A", bg: "#F5F5F5" },
  { name: "Chorus", style: "AI", icon: "waves", font: "Instrument Serif", weight: 400, color: "#F8FAFC", bg: "#0C4A6E" },

  // Fintech
  { name: "Ledgerly", style: "Fintech", icon: "square", font: "IBM Plex Sans", weight: 700, color: "#FFFFFF", bg: "#065F46" },
  { name: "Sable Pay", style: "Fintech", icon: "diamond", font: "Space Grotesk", weight: 700, transform: "uppercase", letterSpacing: 0.06, color: "#F5E6C8", bg: "#0A0A0A" },
  { name: "Cove", style: "Fintech", icon: "waves", font: "Fraunces", weight: 600, color: "#0C4A6E", bg: "#E0F2FE" },

  // Healthcare
  { name: "Ember Wellness", style: "Healthcare", icon: "flame", font: "Fraunces", weight: 600, color: "#7C2D12", bg: "#FFEDD5" },
  { name: "Nest & Nurture", style: "Healthcare", icon: "heart", font: "Spectral", weight: 600, color: "#F8FAFC", bg: "#831843" },

  // Education
  { name: "Quire", style: "Education", icon: "square", font: "Playfair Display", weight: 700, letterSpacing: -0.02, color: "#0F172A", bg: "#FFF7ED" },
  { name: "Meridian Prep", style: "Education", icon: "star", font: "DM Serif Display", weight: 400, transform: "uppercase", letterSpacing: 0.06, color: "#FFFFFF", bg: "#1E293B" },

  // Consumer / Lifestyle
  { name: "Bramble", style: "Consumer", icon: "leaf", font: "Fraunces", weight: 700, color: "#4C1D95", bg: "#EDE9FE" },
  { name: "Tidepool", style: "Consumer", icon: "waves", font: "Syne", weight: 700, color: "#F0F9FF", bg: "#0369A1" },
  { name: "Kiln", style: "Consumer", icon: "flame", font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, color: "#FEF3C7", bg: "#9A3412" },

  // Technology
  { name: "Beacon Grid", style: "Technology", icon: "dot-grid", font: "JetBrains Mono", weight: 700, color: "#FDE68A", bg: "#0B0B0B" },
  { name: "Runway", style: "Technology", icon: "arrow-right", font: "Space Grotesk", weight: 700, letterSpacing: -0.03, color: "#0F172A", bg: "#E0F2FE" },

  // Luxury / Minimal
  { name: "SOLARA", style: "Luxury", icon: "sun", font: "Playfair Display", weight: 500, letterSpacing: 0.12, transform: "uppercase", color: "#78350F", bg: "#FEF3C7" },
  { name: "veil", style: "Minimal", icon: "ring", font: "Geist", weight: 500, transform: "lowercase", color: "#0B0B0B", bg: "#F5F5F5" },
];

function iconPath(kind: IconKind, color: string): string {
  // 64x64 viewbox drawings. Return an inner SVG snippet.
  const c = color;
  switch (kind) {
    case "circle": return `<circle cx="32" cy="32" r="24" fill="${c}"/>`;
    case "ring": return `<circle cx="32" cy="32" r="22" fill="none" stroke="${c}" stroke-width="8"/>`;
    case "dot-grid": return `${[8,24,40,56].flatMap((x)=>[8,24,40,56].map((y)=>`<circle cx="${x+4}" cy="${y+4}" r="3" fill="${c}"/>`)).join("")}`;
    case "square": return `<rect x="10" y="10" width="44" height="44" fill="${c}"/>`;
    case "rounded-square": return `<rect x="8" y="8" width="48" height="48" rx="12" fill="${c}"/>`;
    case "triangle": return `<path d="M32 8 L58 54 L6 54 Z" fill="${c}"/>`;
    case "diamond": return `<path d="M32 6 L58 32 L32 58 L6 32 Z" fill="${c}"/>`;
    case "hexagon": return `<path d="M32 6 L56 20 L56 44 L32 58 L8 44 L8 20 Z" fill="${c}"/>`;
    case "star": return `<path d="M32 6 L39 25 L59 25 L43 37 L49 56 L32 44 L15 56 L21 37 L5 25 L25 25 Z" fill="${c}"/>`;
    case "spark": return `<path d="M32 6 L36 26 L56 32 L36 38 L32 58 L28 38 L8 32 L28 26 Z" fill="${c}"/>`;
    case "bolt": return `<path d="M36 4 L12 36 L28 36 L24 60 L52 26 L34 26 Z" fill="${c}"/>`;
    case "leaf": return `<path d="M8 56 C 8 24 24 8 56 8 C 56 40 40 56 8 56 Z" fill="${c}"/>`;
    case "arrow-up": return `<path d="M32 6 L54 34 L42 34 L42 58 L22 58 L22 34 L10 34 Z" fill="${c}"/>`;
    case "arrow-right": return `<path d="M6 22 L36 22 L36 10 L60 32 L36 54 L36 42 L6 42 Z" fill="${c}"/>`;
    case "waves": return `<path d="M4 24 Q 16 12 32 24 T 60 24" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M4 40 Q 16 28 32 40 T 60 40" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`;
    case "orbit": return `<circle cx="32" cy="32" r="8" fill="${c}"/><ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="${c}" stroke-width="4" transform="rotate(-30 32 32)"/>`;
    case "cross": return `<rect x="26" y="8" width="12" height="48" fill="${c}"/><rect x="8" y="26" width="48" height="12" fill="${c}"/>`;
    case "chevron": return `<path d="M14 12 L34 32 L14 52 L22 52 L44 32 L22 12 Z" fill="${c}"/>`;
    case "moon": return `<path d="M44 8 A 24 24 0 1 0 56 44 A 20 20 0 1 1 44 8 Z" fill="${c}"/>`;
    case "sun": return `<circle cx="32" cy="32" r="12" fill="${c}"/>${[0,45,90,135,180,225,270,315].map(a=>{const r=(a*Math.PI)/180;const x1=32+Math.cos(r)*20,y1=32+Math.sin(r)*20,x2=32+Math.cos(r)*28,y2=32+Math.sin(r)*28;return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`}).join("")}`;
    case "shield": return `<path d="M32 4 L56 14 L56 34 C 56 48 46 58 32 60 C 18 58 8 48 8 34 L8 14 Z" fill="${c}"/>`;
    case "heart": return `<path d="M32 56 C 8 40 8 20 20 14 C 26 11 30 14 32 18 C 34 14 38 11 44 14 C 56 20 56 40 32 56 Z" fill="${c}"/>`;
    case "flame": return `<path d="M32 4 C 40 16 48 22 48 36 C 48 48 40 58 32 58 C 24 58 16 48 16 36 C 16 26 22 22 26 30 C 26 20 30 12 32 4 Z" fill="${c}"/>`;
    case "gear": return `<circle cx="32" cy="32" r="10" fill="none" stroke="${c}" stroke-width="6"/>${[0,60,120,180,240,300].map(a=>{const r=(a*Math.PI)/180;const x=32+Math.cos(r)*22,y=32+Math.sin(r)*22;return `<rect x="${(x-4).toFixed(1)}" y="${(y-4).toFixed(1)}" width="8" height="8" fill="${c}"/>`}).join("")}`;
    case "cube": return `<path d="M32 6 L56 18 L56 44 L32 58 L8 44 L8 18 Z" fill="${c}"/><path d="M32 6 L32 32 L56 18 M32 32 L8 18 M32 32 L32 58" stroke="#00000022" stroke-width="2" fill="none"/>`;
    case "mountain": return `<path d="M4 54 L24 20 L36 38 L44 28 L60 54 Z" fill="${c}"/>`;
    case "eye": return `<path d="M4 32 C 14 16 50 16 60 32 C 50 48 14 48 4 32 Z" fill="${c}"/><circle cx="32" cy="32" r="7" fill="#FFFFFF"/>`;
    case "chat": return `<path d="M8 12 L56 12 L56 44 L36 44 L24 56 L24 44 L8 44 Z" fill="${c}"/>`;
    case "cloud": return `<path d="M20 44 C 8 44 8 28 20 28 C 22 18 40 16 44 26 C 56 26 58 44 44 44 Z" fill="${c}"/>`;
    case "wifi": return `<path d="M8 24 C 22 10 42 10 56 24" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M16 32 C 24 22 40 22 48 32" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M24 40 C 28 34 36 34 40 40" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="48" r="4" fill="${c}"/>`;
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function renderSvg(spec: IconSpec): string {
  const W = 800, H = 600;
  const layout = spec.layout || "stack";
  const iconSize = layout === "stack" ? 180 : 140;
  const iconX = layout === "stack" ? (W - iconSize) / 2 : W / 2 - 260;
  const iconY = layout === "stack" ? 120 : (H - iconSize) / 2;
  const textAnchor = layout === "stack" ? "middle" : "start";
  const textX = layout === "stack" ? W / 2 : iconX + iconSize + 32;
  const textY = layout === "stack" ? iconY + iconSize + 90 : H / 2 + 12;
  const textCase = spec.transform === "uppercase" ? spec.name.toUpperCase() : spec.transform === "lowercase" ? spec.name.toLowerCase() : spec.name;
  const ls = ((spec.letterSpacing ?? 0) * 64).toFixed(2);
  const inner = iconPath(spec.icon, spec.color);
  const family = `${spec.font}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${spec.bg}"/>
    <g transform="translate(${iconX} ${iconY}) scale(${(iconSize / 64).toFixed(3)})">${inner}</g>
    <text x="${textX}" y="${textY}" fill="${spec.color}" text-anchor="${textAnchor}" font-family='${family}' font-weight="${spec.weight}" font-size="72" letter-spacing="${ls}">${escapeXml(textCase)}</text>
  </svg>`;
}

function toDataUrl(svg: string): string {
  // Use encodeURIComponent to keep the SVG inline-safe.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildIconSeedTemplates() {
  return SEEDS.map((spec, i) => {
    const stack = renderSvg({ ...spec, layout: "stack" });
    const editor_state = buildCanvasEditorState(spec);
    return {
      id: `seed-icon-${i}`,
      title: spec.name,
      asset_type: "logo",
      image_url: toDataUrl(stack),
      background: spec.bg,
      prompt: `${spec.name}${spec.tagline ? " — " + spec.tagline : ""}`,
      creator_username: "Rocket Studio",
      created_at: new Date(Date.now() - i * 3600_000).toISOString(),
      meta: { template_style: spec.style, seed: true, tagline: spec.tagline, icon: spec.icon },
      editor_state,
      _seed: true as const,
    };
  });
}

export const ICON_SEED_TEMPLATES = buildIconSeedTemplates();

// Build an El[] canvas state (matching src/pages/Editor.tsx types) so that
// opening an icon template in /editor faithfully reproduces icon + wordmark
// + background instead of falling back to a plain logotype.
function uid() { return Math.random().toString(36).slice(2, 9); }
function buildCanvasEditorState(spec: IconSpec): any[] {
  const W = 800, H = 600;
  const iconSize = 180;
  const iconX = (W - iconSize) / 2;
  const iconY = 120;
  const textCase = spec.transform === "uppercase" ? spec.name.toUpperCase()
    : spec.transform === "lowercase" ? spec.name.toLowerCase()
    : spec.name;
  const inner = iconPath(spec.icon, spec.color);
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${iconSize}" height="${iconSize}">${inner}</svg>`;
  const iconUrl = toDataUrl(iconSvg);
  const bgRect = {
    id: uid(), kind: "rect", x: 0, y: 0, w: W, h: H,
    visible: true, locked: false, fill: spec.bg, radius: 0,
  };
  const iconEl = {
    id: uid(), kind: "image", x: iconX, y: iconY, w: iconSize, h: iconSize,
    visible: true, locked: false, src: iconUrl, color: spec.color,
  };
  const textW = 640;
  const textEl = {
    id: uid(), kind: "text",
    x: (W - textW) / 2, y: iconY + iconSize + 40, w: textW, h: 110,
    visible: true, locked: false,
    text: textCase, color: spec.color, fontSize: 72,
    fontWeight: spec.weight, fontFamily: spec.font, align: "center",
  };
  return [bgRect, iconEl, textEl];
}

// Build an icon-only (no wordmark) data URL for a seed by name.
export function getIconOnlyDataUrl(name: string): string | null {
  const spec = SEEDS.find((s) => s.name === name);
  if (!spec) return null;
  const W = 600, H = 600;
  const size = 320;
  const x = (W - size) / 2;
  const y = (H - size) / 2;
  const inner = iconPath(spec.icon, spec.color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${spec.bg}"/>
    <g transform="translate(${x} ${y}) scale(${(size / 64).toFixed(3)})">${inner}</g>
  </svg>`;
  return toDataUrl(svg);
}
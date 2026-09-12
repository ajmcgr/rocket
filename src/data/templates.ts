export type Template = {
  id: string;
  /** Only complete, reusable starter identities are eligible for public SEO pages. */
  indexable: boolean;
  name: string;
  category: string;
  tagline: string;
  description: string;
  audience: string;
  tone: string;
  colors: string[]; // first = primary
  fonts: string[];  // [headings, body]
  voiceNotes: string;
  sampleName: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "saas-modern",
    indexable: true,
    name: "Modern SaaS",
    category: "Software",
    tagline: "Crisp, technical, conversion-focused.",
    description: "A B2B SaaS product helping teams move faster.",
    audience: "Founders & operators",
    tone: "Minimal & technical",
    colors: ["#0F172A", "#3B82F6", "#10B981", "#F8FAFC", "#94A3B8"],
    fonts: ["Inter", "Inter"],
    voiceNotes: "Direct, benefit-led, no marketing fluff. Short sentences. Use concrete numbers.",
    sampleName: "Linewise",
  },
  {
    id: "ecom-warm",
    indexable: true,
    name: "Warm E-commerce",
    category: "E-commerce",
    tagline: "Inviting, tactile, premium-friendly.",
    description: "A direct-to-consumer brand selling lifestyle goods.",
    audience: "Consumer / general",
    tone: "Warm & human",
    colors: ["#1F2937", "#D97706", "#FCD34D", "#FFFBEB", "#78716C"],
    fonts: ["Fraunces", "Inter"],
    voiceNotes: "Conversational, sensory language, focus on craft and ritual.",
    sampleName: "Hearth & Co.",
  },
  {
    id: "agency-bold",
    indexable: true,
    name: "Bold Agency",
    category: "Agency",
    tagline: "Editorial, confident, portfolio-led.",
    description: "A creative studio for ambitious early-stage companies.",
    audience: "Designers & creatives",
    tone: "Bold & confident",
    colors: ["#000000", "#FFFFFF", "#FF3B30", "#F5F5F5", "#1C1C1E"],
    fonts: ["Space Grotesk", "Inter"],
    voiceNotes: "Punchy, opinionated. Short statements. Lean into craft and case studies.",
    sampleName: "North & Co.",
  },
  {
    id: "creator-personal",
    indexable: true,
    name: "Creator / Personal",
    category: "Personal brand",
    tagline: "Approachable, playful, builds in public.",
    description: "A solo creator sharing their journey and products.",
    audience: "Indie developers",
    tone: "Friendly & playful",
    colors: ["#0EA5E9", "#FACC15", "#F472B6", "#0F172A", "#FFFFFF"],
    fonts: ["Cabinet Grotesk", "Inter"],
    voiceNotes: "First-person, warm, lots of specifics. OK to be casual and self-deprecating.",
    sampleName: "Alex Builds",
  },
  {
    id: "fintech-trust",
    indexable: true,
    name: "Trustworthy Fintech",
    category: "Fintech",
    tagline: "Calm, precise, security-forward.",
    description: "A financial product for serious operators who hate fluff.",
    audience: "SMB owners",
    tone: "Minimal & technical",
    colors: ["#0B1F3A", "#1E40AF", "#22C55E", "#F1F5F9", "#475569"],
    fonts: ["Söhne", "Inter"],
    voiceNotes: "Precise, never hyped. Lead with proof: compliance, uptime, numbers.",
    sampleName: "Ledgerly",
  },
  {
    id: "wellness-editorial",
    indexable: true,
    name: "Editorial Wellness",
    category: "Lifestyle",
    tagline: "Quiet, considered, magazine-style.",
    description: "A wellness brand built around slow, intentional habits.",
    audience: "Consumer / general",
    tone: "Luxe & editorial",
    colors: ["#1A1A1A", "#E5E1D8", "#8B7355", "#FFFFFF", "#3F3F3F"],
    fonts: ["Canela", "Inter"],
    voiceNotes: "Spare, sensorial, never preachy. Read like a quiet print magazine.",
    sampleName: "Slow North",
  },
];

export const getTemplate = (id: string) => TEMPLATES.find(t => t.id === id);

export const publicTemplates = () => TEMPLATES.filter((template) =>
  template.indexable &&
  Boolean(template.name && template.category && template.tagline && template.description && template.audience && template.tone) &&
  template.colors.length >= 3 &&
  template.fonts.length >= 2 &&
  Boolean(template.voiceNotes && template.sampleName),
);

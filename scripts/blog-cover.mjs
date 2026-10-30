const xml = (value) => value.replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;",
}[char]));

const hash = (value) => [...value].reduce((result, char) => ((result * 31) + char.charCodeAt(0)) >>> 0, 0);

const titleLines = (title) => {
  const words = title.split(/\s+/);
  const lines = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= 25) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length > 5) {
    lines[4] = `${lines[4]}…`;
    lines.length = 5;
  }
  return lines.map((line, index) => `<text x="100" y="${280 + index * 63}" font-size="50" font-weight="750" fill="currentColor">${xml(line)}</text>`).join("\n    ");
};

const scenes = [
  // Launch: a paper rocket rising through a circular orbit.
  `<circle cx="1240" cy="446" r="305" fill="#1668D9"/><circle cx="1240" cy="446" r="230" fill="none" stroke="#80B8F8" stroke-width="4"/>
   <path d="M986 738c88-145 176-183 334-222" fill="none" stroke="#F46D42" stroke-width="20" stroke-linecap="round"/>
   <path d="M1018 745c86-94 162-126 286-155" fill="none" stroke="#F7B466" stroke-width="9" stroke-linecap="round"/>
   <g transform="translate(1215 395) rotate(28)"><path d="M0-220c75 76 91 199 0 336-91-137-75-260 0-336Z" fill="#FFFFFF" stroke="#112A4C" stroke-width="12"/><circle cx="0" cy="-85" r="42" fill="#F46D42" stroke="#112A4C" stroke-width="10"/><path d="M-55 53-127 170-32 118M55 53l72 117-95-52" fill="#F46D42" stroke="#112A4C" stroke-width="10" stroke-linejoin="round"/></g>`,
  // A practical checklist on a large clipboard.
  `<circle cx="1280" cy="435" r="310" fill="#DBECFF"/><rect x="968" y="127" width="520" height="645" rx="34" fill="#FFFFFF" stroke="#153E70" stroke-width="12"/>
   <rect x="1120" y="102" width="216" height="70" rx="24" fill="#1676E3"/>
   <path d="M1035 284l25 28 44-56M1035 415l25 28 44-56M1035 546l25 28 44-56" fill="none" stroke="#F2683C" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M1140 287h274M1140 418h274M1140 549h201" stroke="#163F70" stroke-width="18" stroke-linecap="round"/>`,
  // Launchpad: four distinct app tiles and an upward arrow.
  `<circle cx="1280" cy="434" r="310" fill="#D9F3EA"/><rect x="962" y="160" width="576" height="565" rx="46" fill="#FFFFFF" stroke="#0D5947" stroke-width="12"/>
   <rect x="1020" y="217" width="196" height="190" rx="28" fill="#1676E3"/><circle cx="1118" cy="313" r="48" fill="#FFFFFF"/>
   <rect x="1260" y="217" width="196" height="190" rx="28" fill="#F2683C"/><path d="M1310 356l48-85 48 85Z" fill="#FFFFFF"/>
   <rect x="1020" y="450" width="196" height="190" rx="28" fill="#173B64"/><path d="M1070 547h97M1118 500v94" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round"/>
   <rect x="1260" y="450" width="196" height="190" rx="28" fill="#8ECFB2"/><path d="m1305 550 43 43 68-98" fill="none" stroke="#0D5947" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Validation: a target, an experiment card and a clear result.
  `<circle cx="1260" cy="438" r="306" fill="#E8E2FF"/><circle cx="1244" cy="436" r="224" fill="#FFFFFF" stroke="#6542AE" stroke-width="12"/>
   <circle cx="1244" cy="436" r="158" fill="none" stroke="#A78EE2" stroke-width="26"/><circle cx="1244" cy="436" r="83" fill="#F2683C"/>
   <path d="m1190 435 38 40 75-92" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
   <rect x="950" y="625" width="255" height="112" rx="22" fill="#FFFFFF" stroke="#6542AE" stroke-width="9"/><path d="M987 696l46-36 43 21 69-35" fill="none" stroke="#1676E3" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
];

const palettes = [
  { background: "#F2F6FF", text: "#112A4C", label: "#1668D9" },
  { background: "#FFF9F0", text: "#153E70", label: "#F2683C" },
  { background: "#F2FBF6", text: "#0D5947", label: "#1676E3" },
  { background: "#F9F5FF", text: "#342261", label: "#6542AE" },
];

export const coverVariantCount = scenes.length;

/** A legible, article-specific cover. Same input always produces the same SVG. */
export const coverSvg = (title, slug, variant = hash(slug) % scenes.length) => {
  const index = variant % scenes.length;
  const palette = palettes[index];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" data-variant="${index}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(title)}</title>
  <desc id="desc">A Rocket Journal illustration for this article.</desc>
  <rect width="1600" height="900" fill="${palette.background}"/>
  <g font-family="Arial, Helvetica, sans-serif" style="color:${palette.text}">
    <text x="100" y="112" fill="${palette.label}" font-size="29" font-weight="700" letter-spacing="5">ROCKET JOURNAL</text>
    ${titleLines(title)}
    <path d="M100 730h630" stroke="${palette.label}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="110" cy="795" r="15" fill="${palette.label}"/>
    <circle cx="155" cy="795" r="15" fill="${palette.text}"/>
    <circle cx="200" cy="795" r="15" fill="#F2683C"/>
  </g>
  ${scenes[index]}
</svg>
`;
};

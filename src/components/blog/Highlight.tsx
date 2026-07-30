type Props = { text: string; query: string; className?: string };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Highlights matching search terms inside a piece of text. */
const Highlight = ({ text, query, className }: Props) => {
  const terms = query.trim().split(/\s+/).filter((term) => term.length > 1).map(escapeRegExp);
  if (!terms.length) return <span className={className}>{text}</span>;

  const pattern = new RegExp(`(${terms.join("|")})`, "ig");
  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        pattern.test(part) && index % 2 === 1 ? (
          <mark key={index} className="rounded bg-brand/15 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
};

export default Highlight;
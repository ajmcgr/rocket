export default function TrendArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <span
      aria-hidden="true"
      className={direction === "up" ? "font-bold text-green-700" : "font-bold text-red-600"}
    >
      {direction === "up" ? "↑" : "↓"}
    </span>
  );
}

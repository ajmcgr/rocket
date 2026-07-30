import type { BlogPost } from "@/content/blogMeta";
import { cn } from "@/lib/utils";

type Props = {
  post: BlogPost;
  className?: string;
  size?: "sm" | "lg";
  priority?: boolean;
};

/** Deterministic, instantly-painted cover. Uses an uploaded cover image when a
 *  post provides one, otherwise renders a generated duotone mark — so every
 *  newly published article has artwork with zero manual configuration. */
const ArticleCover = ({ post, className, size = "sm", priority = false }: Props) => {
  const { image, from, to, angle, seed } = post.cover;

  if (image) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl bg-neutral-100", className)}>
        <img
          src={image}
          alt={post.title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      </div>
    );
  }

  const initials = post.title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl", className)}
      style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,.9) 0, transparent 45%), radial-gradient(circle at 85% 70%, rgba(255,255,255,.55) 0, transparent 40%)",
        }}
      />
      <div
        className="absolute -right-10 -top-16 h-56 w-56 rounded-full border opacity-20"
        style={{ borderColor: "rgba(255,255,255,.8)", transform: `rotate(${seed % 45}deg)` }}
      />
      <div className="absolute inset-0 flex flex-col justify-between p-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
          {post.category}
        </span>
        <span
          className={cn("text-white/95", size === "lg" ? "text-7xl" : "text-4xl")}
          style={{ fontFamily: "Reckless, ui-serif, Georgia, serif", lineHeight: 1 }}
        >
          {initials}
        </span>
      </div>
    </div>
  );
};

export default ArticleCover;
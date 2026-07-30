import { Link } from "react-router-dom";
import ArticleCover from "./ArticleCover";
import Highlight from "./Highlight";
import { formatDate, type BlogPost } from "@/content/blogMeta";
import { cn } from "@/lib/utils";

type Props = { post: BlogPost; query?: string; className?: string; compact?: boolean };

const ArticleCard = ({ post, query = "", className, compact = false }: Props) => (
  <article className={cn("group", className)}>
    <Link to={`/blog/${post.slug}`} className="block focus:outline-none">
      <ArticleCover
        post={post}
        className={cn(
          "w-full transition-shadow duration-300 group-hover:shadow-[0_18px_50px_-24px_rgba(15,23,42,0.45)]",
          compact ? "aspect-[16/10]" : "aspect-[16/9]",
        )}
      />
      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <span className="font-semibold text-brand">{post.category}</span>
          <span aria-hidden>·</span>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden>·</span>
          <span>{post.minutes} read</span>
        </div>
        <h3
          className={cn(
            "mt-3 font-medium leading-snug tracking-tight text-neutral-900 transition-colors duration-200 group-hover:text-brand",
            compact ? "text-lg" : "text-xl",
          )}
          style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
        >
          <Highlight text={post.title} query={query} />
        </h3>
        <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-neutral-600">
          <Highlight text={post.excerpt} query={query} />
        </p>
      </div>
    </Link>
  </article>
);

export default ArticleCard;
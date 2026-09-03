import { Link, useParams } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ArticleCard from "@/components/blog/ArticleCard";
import { getAuthor, postsByAuthor } from "@/content/blogMeta";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const BlogAuthor = () => {
  const { id } = useParams();
  const author = getAuthor(id);
  const authored = postsByAuthor(author.id);

  useDocumentMeta({
    title: `${author.name} — Rocket Blog`,
    description: author.bio,
    canonical: `https://tryrocket.ai/blog/author/${author.id}`,
  });

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-14">
        <Link to="/blog" className="text-sm text-neutral-500 hover:text-neutral-900">← All articles</Link>
        <header className="mt-8 flex flex-col gap-6 border-b border-neutral-200 pb-12 sm:flex-row sm:items-center">
          <img src={author.avatar} alt={author.name} className="h-24 w-24 rounded-full object-cover" />
          <div>
            <h1
              className="text-3xl font-medium tracking-tight sm:text-4xl"
              style={{ fontFamily: "Reckless, ui-serif, Georgia, serif" }}
            >
              {author.name}
            </h1>
            <div className="mt-1 text-sm text-neutral-500">{author.role}</div>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">{author.bio}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {author.socials.map((social) => (
                <a key={social.label} href={social.href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </header>

        <section className="mt-12">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            {authored.length} article{authored.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {authored.map((post) => (
              <ArticleCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default BlogAuthor;

import { useCallback, useEffect, useState } from "react";
import {
  loadNewsletterSections,
  newsletterCopy,
  type NewsletterSection,
} from "@/lib/adminNewsletter";

async function copyNewsletter(sections: NewsletterSection[]) {
  const { html, plain } = newsletterCopy(sections);
  if (!plain) throw new Error("There is no current content to copy.");
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

export default function AdminNewsletter() {
  const [sections, setSections] = useState<NewsletterSection[]>([]);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const result = await loadNewsletterSections();
    setSections(result);
    setLoadedAt(new Date());
    return result;
  }, []);
  useEffect(() => {
    let active = true;
    void loadNewsletterSections()
      .then((result) => {
        if (active) {
          setSections(result);
          setLoadedAt(new Date());
        }
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);
  const copy = async (key?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Recheck active ad windows and current public shelves at copy time.
      const current = await refresh();
      const chosen = key
        ? current.filter((section) => section.key === key)
        : current;
      await copyNewsletter(chosen);
      setNotice(
        key
          ? `${chosen[0]?.title || "Section"} copied.`
          : "Newsletter copied for Beehiiv.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="rocket-admin-panel"
      aria-labelledby="admin-newsletter-heading"
    >
      <div className="rocket-admin-newsletter-heading">
        <div>
          <h2 id="admin-newsletter-heading">This week on Rocket</h2>
          <p className="rocket-admin-muted">
            Live Rocket discovery content, ready for one paste into Beehiiv.
            Nothing is sent from here.
          </p>
          {loadedAt && (
            <p className="rocket-admin-muted">
              Refreshed {loadedAt.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rocket-admin-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              void refresh().catch((cause) =>
                setError((cause as Error).message),
              );
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rocket-admin-primary"
            disabled={
              busy || !sections.some((section) => section.entries.length)
            }
            onClick={() => void copy()}
          >
            Copy newsletter
          </button>
        </div>
      </div>
      {error && (
        <p className="rocket-admin-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loadedAt && !error && (
        <p className="rocket-admin-muted">Loading newsletter content…</p>
      )}
      {loadedAt && (
        <div className="rocket-admin-newsletter-grid">
          {sections.map((section) => (
            <article
              key={section.key}
              className="rocket-admin-newsletter-section"
            >
              <div className="rocket-admin-newsletter-section-heading">
                <div>
                  <h3>{section.title}</h3>
                  <p className="rocket-admin-muted">{section.description}</p>
                </div>
                <button
                  type="button"
                  disabled={busy || !section.entries.length}
                  onClick={() => void copy(section.key)}
                >
                  Copy section
                </button>
              </div>
              {section.entries.length ? (
                <ul>
                  {section.entries.map((entry, index) => (
                    <li key={`${entry.url}-${index}`}>
                      {entry.sponsored && (
                        <span className="rocket-admin-sponsored">
                          Sponsored
                        </span>
                      )}
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {entry.title}
                      </a>
                      {entry.subtitle && <span>{entry.subtitle}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rocket-admin-muted">No current items.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

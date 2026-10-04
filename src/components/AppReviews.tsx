import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "@/lib/router-compat";
import { Star } from "lucide-react";

type Review = {
  id: string;
  app_id: string;
  user_id: string;
  rating: number;
  body: string;
  created_at: string;
  updated_at: string;
};
type Summary = { rating_count: number; average_rating: number };

export default function AppReviews({
  appId,
  onSummary,
}: {
  appId: string;
  onSummary?: (summary: Summary | null) => void;
}) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [list, aggregate] = await Promise.all([
      supabase
        .from("public_app_reviews")
        .select("id,app_id,user_id,rating,body,created_at,updated_at")
        .eq("app_id", appId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("public_app_review_summary")
        .select("rating_count,average_rating")
        .eq("app_id", appId)
        .maybeSingle(),
    ]);
    if (!list.error) setReviews(list.data || []);
    if (!aggregate.error) {
      setSummary(aggregate.data);
      onSummary?.(aggregate.data);
    }
  }, [appId, onSummary]);
  useEffect(() => {
    void load();
  }, [load]);
  const mine = reviews.find((review) => review.user_id === user?.id);
  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setBody(mine.body);
    }
  }, [mine]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc("upsert_app_review", {
      p_app_id: appId,
      p_rating: rating,
      p_body: body.trim(),
    });
    if (requestError)
      setError(
        "Your review could not be saved. Check the rating and write at least 10 characters.",
      );
    else {
      setNotice("Review saved.");
      await load();
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm("Delete your review?")) return;
    setBusy(true);
    setError("");
    const { error: requestError } = await supabase.rpc("delete_app_review", {
      p_app_id: appId,
    });
    if (requestError) setError("Your review could not be deleted.");
    else {
      setBody("");
      setNotice("Review deleted.");
      await load();
    }
    setBusy(false);
  };
  const report = async (reviewId: string) => {
    const reason = window.prompt(
      "Why should Rocket review this? (10–500 characters)",
    );
    if (!reason) return;
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError("Please give a reason between 10 and 500 characters.");
      return;
    }
    const { error: requestError } = await supabase.rpc("report_app_review", {
      p_review_id: reviewId,
      p_reason: reason.trim(),
    });
    setNotice(
      requestError
        ? "The report could not be sent."
        : "Thanks. Rocket will review this report.",
    );
  };
  return (
    <section
      className="mt-8 border-t border-neutral-200 pt-7"
      aria-labelledby="reviews-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-xl font-semibold tracking-tight">
            Reviews
          </h2>
        </div>
        {summary && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg" aria-hidden="true">⭐</span>
            <strong className="text-xl">{summary.average_rating}</strong>
            <span className="text-neutral-500">
              from {summary.rating_count}{" "}
              {summary.rating_count === 1 ? "review" : "reviews"}
            </span>
          </div>
        )}
      </div>
      {reviews.length === 0 && (
        <p className="mt-5 text-sm text-neutral-600">
          No reviews yet. Be the first to share a useful, honest impression.
        </p>
      )}
      {reviews.length > 0 && (
        <div className="mt-6 space-y-4">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="border-t border-neutral-100 pt-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  {"★".repeat(review.rating)}
                  <span className="sr-only">
                    {review.rating} out of 5 stars
                  </span>
                </span>
                <time className="text-xs text-neutral-500">
                  {new Date(review.created_at).toLocaleDateString()}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                {review.body}
              </p>
              {user && user.id !== review.user_id && (
                <button
                  type="button"
                  className="mt-2 text-xs text-neutral-500 underline"
                  onClick={() => report(review.id)}
                >
                  Report review
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {user ? (
        <form className="mt-8 border-t border-neutral-100 pt-6" onSubmit={save}>
          <h3 className="font-semibold">
            {mine ? "Edit your review" : "Write a review"}
          </h3>
          <fieldset className="mt-3" disabled={busy}>
            <legend className="text-sm text-neutral-600">Your rating</legend>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="relative cursor-pointer">
                  <input type="radio" name="app-rating" value={n} checked={rating === n}
                    onChange={() => setRating(n)} aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                    className="peer sr-only" />
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-amber-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600 peer-disabled:opacity-50">
                    <Star aria-hidden="true" size={28} className={n <= rating ? "fill-amber-400 text-amber-500" : "text-neutral-400"} />
                  </span>
                </label>
              ))}
              <span className="ml-2 text-sm text-neutral-600" aria-live="polite">{rating} out of 5</span>
            </div>
          </fieldset>
          <label
            className="mt-4 block text-sm text-neutral-600"
            htmlFor="app-review-body"
          >
            Your experience
          </label>
          <textarea
            id="app-review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={10}
            maxLength={1000}
            required
            rows={3}
            className="mt-1 w-full rounded-xl border border-neutral-300 p-3 text-sm"
            placeholder="What should someone know before trying this app?"
          />
          <div className="mt-3 flex gap-3">
            <button
              disabled={busy}
              className="rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mine ? "Update review" : "Post review"}
            </button>
            {mine && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="text-sm text-neutral-600 underline"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="mt-6 text-sm text-neutral-600">
          <Link
            to={`/login?next=${encodeURIComponent(`/apps/${appId}`)}`}
            className="font-semibold text-sky-800 underline"
          >
            Sign in
          </Link>{" "}
          to review this app.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {notice}
        </p>
      )}
    </section>
  );
}

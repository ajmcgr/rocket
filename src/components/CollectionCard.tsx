import { Link } from "@/lib/router-compat";
import {
  collectionCreator,
  collectionPath,
  type Collection,
} from "@/lib/collections";
import AppLogo from "./AppLogo";
import CollectionOptions from "./CollectionOptions";

export default function CollectionCard({
  collection,
  personal = false,
  onUpdated,
}: {
  collection: Collection;
  personal?: boolean;
  onUpdated?: () => void;
}) {
  const creator = collectionCreator(collection);
  return (
    <article
      className={`${personal ? "pr-20" : ""} relative min-w-0 rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-[#469DDA] hover:bg-neutral-50 focus-within:outline focus-within:outline-2 focus-within:outline-[#469DDA] dark:border-neutral-700 dark:bg-neutral-900`}
    >
      <Link
        to={collectionPath(collection, personal)}
        className="absolute inset-0 rounded-3xl"
        aria-label={`View ${collection.name} collection`}
      />
      <div className="mb-5 flex min-h-12 flex-wrap gap-2" aria-hidden="true">
        {collection.logos?.map((logo, index) => (
          <AppLogo key={index} name="App" src={logo} className="h-12 w-12" />
        ))}
        {!collection.logos?.length && (
          <span className="text-sm text-neutral-500">
            Your next discoveries belong here.
          </span>
        )}
      </div>
      <h3 className="break-words text-xl font-semibold tracking-tight">
        {collection.name}
      </h3>
      <p className="mt-2 text-sm text-neutral-500">
        {collection.app_count}{" "}
        {Number(collection.app_count) === 1 ? "app" : "apps"}
        {personal ? (
          ` · ${collection.visibility === "public" ? "Public" : "Private"}`
        ) : (
          <>
            {" · "}
            {creator.href ? (
              <Link className="relative z-10 hover:underline" to={creator.href}>
                {creator.label}
              </Link>
            ) : (
              creator.label
            )}
          </>
        )}
      </p>
      {personal && (
        <div className="absolute right-4 top-4 z-10">
          <CollectionOptions collection={collection} onUpdated={onUpdated} />
        </div>
      )}
    </article>
  );
}

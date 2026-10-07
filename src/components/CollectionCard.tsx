import { Link } from "@/lib/router-compat";
import { collectionPath, type Collection } from "@/lib/collections";
import AppLogo from "./AppLogo";

export default function CollectionCard({
  collection,
  personal = false,
}: {
  collection: Collection;
  personal?: boolean;
}) {
  return (
    <Link
      to={collectionPath(collection, personal)}
      className="block min-w-0 rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-[#469DDA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#469DDA] dark:border-neutral-700 dark:bg-neutral-900"
    >
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
        {personal
          ? ` · ${collection.visibility === "public" ? "Public" : "Private"}`
          : ` · ${collection.full_name || (collection.username ? `@${collection.username}` : "Rocket member")}`}
      </p>
    </Link>
  );
}

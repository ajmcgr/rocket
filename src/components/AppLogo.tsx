import { useState } from "react";

type Props = {
  name: string;
  src?: string | null;
  className?: string;
  eager?: boolean;
};

/** Show the source icon without adding a simulated app-tile background. */
export default function AppLogo({
  name,
  src,
  className = "h-12 w-12",
  eager = false,
}: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(src && failedUrl !== src);

  return (
    <div
      className={`flex shrink-0 items-center justify-center text-lg font-semibold text-neutral-500 ${className}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailedUrl(src!)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span aria-hidden="true">
          {name.trim().charAt(0).toUpperCase() || "•"}
        </span>
      )}
    </div>
  );
}

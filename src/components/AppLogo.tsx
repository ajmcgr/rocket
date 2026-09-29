import { useState } from "react";

type Props = {
  name: string;
  src?: string | null;
  className?: string;
  eager?: boolean;
};

/** A consistent frame for square icons, wide wordmarks, and missing artwork. */
export default function AppLogo({ name, src, className = "h-12 w-12", eager = false }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(src && failedUrl !== src);

  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white to-neutral-100 text-lg font-semibold text-neutral-500 ${className}`}>
    {showImage ? <img
      src={src!}
      alt=""
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailedUrl(src!)}
      className="h-full w-full object-contain p-1.5 [filter:drop-shadow(0_1px_1px_rgba(15,23,42,0.32))]"
    /> : <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "•"}</span>}
  </div>;
}

import type { ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fit?: "contain" | "cover";
};

// Render inside a positioned, overflow-hidden preview. The foreground keeps
// the full screenshot; its matching backdrop fills any letterboxing.
export default function AppScreenshot({
  fit = "contain",
  className = "",
  ...props
}: Props) {
  return (
    <>
      {fit === "contain" && (
        <img
          src={props.src}
          srcSet={props.srcSet}
          sizes={props.sizes}
          loading={props.loading}
          decoding={props.decoding}
          fetchPriority={props.fetchPriority}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="app-screenshot-backdrop pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-xl"
        />
      )}
      <img
        {...props}
        className={`relative ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      />
    </>
  );
}

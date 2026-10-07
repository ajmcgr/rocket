import { useState, type ReactNode } from "react";
import { safeProfileUrl } from "@/lib/memberProfile";
import { profileAvatarUrl } from "@/lib/profileAvatar";

export default function ProfileAvatarImage(props: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  return <AvatarSource key={props.src} {...props} />;
}

function AvatarSource({
  src,
  alt,
  className,
  fallback = null,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const original = safeProfileUrl(src);
  const preferred = profileAvatarUrl(src);
  const [attempt, setAttempt] = useState(0);
  const resolved =
    attempt === 0
      ? preferred
      : attempt === 1 && original !== preferred
        ? original
        : undefined;
  return resolved ? (
    <img
      src={resolved}
      alt={alt}
      className={className}
      decoding="async"
      onError={() => setAttempt((n) => n + 1)}
    />
  ) : (
    <>{fallback}</>
  );
}

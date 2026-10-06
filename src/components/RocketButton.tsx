import { createElement, useEffect, useRef } from "react";

export type RocketButtonProps = {
  action: "continue" | "buy";
  variant?: "primary" | "dark" | "light";
  loading?: boolean;
  disabled?: boolean;
  onActivate?: () => void;
};
/** Fixed branding; handlers retain ownership of the existing OAuth/payment flow. */
export default function RocketButton({
  action,
  variant = "primary",
  loading = false,
  disabled = false,
  onActivate,
}: RocketButtonProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // Same versioned, framework-independent module supplied to external apps.
    void import("../../public/buttons/v1/rocket-buttons.js");
  }, []);
  useEffect(() => {
    const node = ref.current;
    const activate = () => {
      if (!loading && !disabled) onActivate?.();
    };
    node?.addEventListener("rocket-activate", activate);
    return () => node?.removeEventListener("rocket-activate", activate);
  }, [onActivate, loading, disabled]);
  return createElement("rocket-button", {
    ref,
    action,
    variant,
    ...(loading ? { loading: "" } : {}),
    ...(disabled ? { disabled: "" } : {}),
  });
}

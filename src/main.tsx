import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Browser extensions (e.g. MetaMask) inject scripts that can throw unhandled
// rejections unrelated to the app. Swallow those so they aren't treated as app crashes.
const isExtensionError = (reason: unknown) => {
  const r = reason as { stack?: string; message?: string } | undefined;
  const text = `${r?.stack ?? ""} ${r?.message ?? String(reason ?? "")}`;
  return /chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|MetaMask/i.test(text);
};
window.addEventListener("unhandledrejection", (e) => {
  if (isExtensionError(e.reason)) e.preventDefault();
});
window.addEventListener("error", (e) => {
  if (isExtensionError(e.error) || /-extension:\/\//.test(e.filename || "")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);

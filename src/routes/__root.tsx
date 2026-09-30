import { useEffect, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ScrollToTop } from "@/components/ScrollToTop";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import NotFound from "@/pages/NotFound";
import appCss from "../styles.css?url";

// ported from main.tsx — browser extensions (e.g. MetaMask) inject scripts that can
// throw unhandled rejections unrelated to the app; swallow those before hydration.
const extensionErrorSuppression = `(function(){var isExt=function(r){var t=((r&&r.stack)||"")+" "+((r&&r.message)||String(r||""));return /chrome-extension:\\/\\/|moz-extension:\\/\\/|safari-web-extension:\\/\\/|MetaMask/i.test(t)};window.addEventListener("unhandledrejection",function(e){if(isExt(e.reason))e.preventDefault()});window.addEventListener("error",function(e){if(isExt(e.error)||/-extension:\\/\\//.test(e.filename||""))e.preventDefault()});})();`;

const SITE_TITLE = "Rocket — Discover independent apps worth using";
const SITE_DESCRIPTION =
  "Discover independent apps worth using. Explore what's rising, save your favorites, and launch your own app on Rocket.";
const SOCIAL_IMAGE =
  "https://tryrocket.ai/__l5e/assets-v1/0903ee88-5f0b-4c82-b73a-ca1eb9454294/social-sharing-card.png";
type GoogleTranslateWindow = Window & {
  googleTranslateElementInit?: () => void;
  google?: {
    translate?: {
      TranslateElement: new (
        options: Record<string, unknown>,
        elementId: string,
      ) => unknown;
    };
  };
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1.0" },
        { title: SITE_TITLE },
        { name: "description", content: SITE_DESCRIPTION },
        { name: "author", content: "Rocket" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: SITE_TITLE },
        { property: "og:description", content: SITE_DESCRIPTION },
        { property: "og:image", content: SOCIAL_IMAGE },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:site", content: "@tryrocketai" },
        { name: "twitter:title", content: SITE_TITLE },
        { name: "twitter:description", content: SITE_DESCRIPTION },
        { name: "twitter:image", content: SOCIAL_IMAGE },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          href: "/fonts/Reckless-Regular.ttf",
          as: "font",
          type: "font/ttf",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          href: "/fonts/Reckless-Medium.otf",
          as: "font",
          type: "font/otf",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap",
        },
      ],
      scripts: [
        // Re-apply the stored theme before first paint to avoid a light flash.
        {
          children:
            'try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}',
        },
        { children: extensionErrorSuppression },
        {
          src: "https://www.googletagmanager.com/gtag/js?id=G-0SNE7T7S79",
          async: true,
        },
        {
          children:
            "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-0SNE7T7S79');",
        },
        {
          src: "https://analytics.ahrefs.com/analytics.js",
          "data-key": "0nkhN8ICog83HQJg7HLlXA",
          async: true,
        },
        {
          children:
            'window.$crisp=[];window.CRISP_WEBSITE_ID="3630204c-84d4-4805-a7aa-074ba31a7c12";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();',
        },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: () => <NotFound />,
    errorComponent: RootErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <div
          id="google_translate_element"
          style={{ display: "none" }}
          suppressHydrationWarning
        />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Google Translate mutates the DOM (body styles + widget markup); loading it
  // before hydration causes a mismatch on every page, so defer it until after.
  useEffect(() => {
    if (document.getElementById("google-translate-loader")) return;
    const translateWindow = window as GoogleTranslateWindow;
    translateWindow.googleTranslateElementInit = () => {
      if (!translateWindow.google?.translate?.TranslateElement) return;
      new translateWindow.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,de,fr,es,it,pt,nl,pl,tr,ja",
          autoDisplay: false,
        },
        "google_translate_element",
      );
    };
    const s = document.createElement("script");
    s.id = "google-translate-loader";
    s.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.head.appendChild(s);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <NotificationsProvider>
            <ScrollToTop />
            <Outlet />
          </NotificationsProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RootErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center font-body text-neutral-900">
      <h1 className="font-display text-2xl">This page didn't load</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Something went wrong on our end. You can try again or head back home.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

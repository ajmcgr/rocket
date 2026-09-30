import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const LANGUAGES = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "zh-CN", flag: "🇨🇳", label: "中文" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
];

export default function LanguageSelector() {
  const [lang, setLang] = useState(LANGUAGES[0]);
  useEffect(() => {
    const code = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i)?.[1];
    if (code)
      setLang(LANGUAGES.find((item) => item.code === code) || LANGUAGES[0]);
  }, []);
  const select = (value: (typeof LANGUAGES)[number]) => {
    setLang(value);
    const host = window.location.hostname;
    for (const domain of ["", host, `.${host}`])
      document.cookie = `googtrans=;path=/;${domain ? `domain=${domain};` : ""}expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    if (value.code !== "en") {
      const translated = `/en/${value.code}`;
      for (const domain of ["", host, `.${host}`])
        document.cookie = `googtrans=${translated};path=/;${domain ? `domain=${domain};` : ""}`;
    }
    window.location.reload();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Choose language"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-[#167ac6] dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <span className="text-[21px] leading-none" aria-hidden="true">{lang.flag}</span>
        <ChevronDown className="h-4 w-4 stroke-[1.8]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-52 max-h-[min(38rem,calc(100vh-5rem))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 text-neutral-800 shadow-[0_10px_28px_rgba(0,0,0,0.16)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        {LANGUAGES.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onSelect={() => select(item)}
            className={`min-h-11 gap-2 rounded-lg px-2 text-base font-medium text-neutral-800 focus:bg-neutral-100 dark:text-neutral-100 dark:focus:bg-neutral-800 ${item.code === lang.code ? "bg-neutral-200" : ""}`}
          >
            {item.code === lang.code ? (
              <Check className="h-[18px] w-[18px] shrink-0 stroke-[1.8]" aria-hidden="true" />
            ) : (
              <span className="w-[18px] shrink-0" aria-hidden="true" />
            )}
            <span className="w-6 shrink-0 text-xl leading-none" aria-hidden="true">{item.flag}</span>
            <span className="truncate">{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

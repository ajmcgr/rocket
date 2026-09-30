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
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <span className="text-base leading-none">{lang.flag}</span>
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 overflow-y-auto border-neutral-200 bg-white text-neutral-900"
        style={{ colorScheme: "light" }}
      >
        {LANGUAGES.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onSelect={() => select(item)}
            className="gap-2 text-neutral-900 focus:bg-neutral-100"
          >
            {item.code === lang.code ? (
              <Check className="h-4 w-4" />
            ) : (
              <span className="w-4" />
            )}
            <span className="text-base">{item.flag}</span>
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

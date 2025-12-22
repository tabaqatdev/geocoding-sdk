import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import en from "./en.json";
import ar from "./ar.json";

export type Language = "en" | "ar";
export type Direction = "ltr" | "rtl";

type TranslationKey = string;
type NestedTranslations = Record<string, string | Record<string, string | Record<string, string>>>;

const translations: Record<Language, NestedTranslations> = { en, ar };

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: NestedTranslations, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // Return the key if path not found
    }
  }

  return typeof current === "string" ? current : path;
}

interface LanguageProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
}

export function LanguageProvider({ children, defaultLanguage = "en" }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("language") as Language;
      if (stored === "en" || stored === "ar") return stored;
    }
    return defaultLanguage;
  });

  const direction: Direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    // Update document direction and language
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
    localStorage.setItem("language", language);
  }, [language, direction]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return getNestedValue(translations[language], key);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

export function useTranslation() {
  const { t, language, direction } = useLanguage();
  return { t, language, direction, isRTL: direction === "rtl" };
}

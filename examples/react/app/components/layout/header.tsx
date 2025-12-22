import { MapPin, Github, Menu } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { useTranslation } from "~/i18n/context";
import { cn } from "~/lib/utils";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { t, language } = useTranslation();
  const isRTL = language === "ar";

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center" dir={isRTL ? "rtl" : "ltr"}>
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("md:hidden shrink-0", isRTL ? "ml-2" : "mr-2")}
          onClick={onMenuClick}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <Link
          to="/"
          className={cn(
            "flex items-center shrink-0",
            isRTL ? "flex-row-reverse gap-2 ml-4" : "gap-2 mr-4"
          )}
        >
          <MapPin className="h-6 w-6 text-primary shrink-0" />
          <span className="hidden font-bold sm:inline-block whitespace-nowrap">
            {t("common.appName")}
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          className={cn(
            "hidden md:flex items-center text-sm flex-1",
            isRTL ? "gap-6 flex-row-reverse" : "gap-6"
          )}
        >
          <Link
            to="/playground"
            className="transition-colors hover:text-foreground/80 text-foreground/60 whitespace-nowrap"
          >
            {t("nav.playground")}
          </Link>
          <Link
            to="/docs/getting-started"
            className="transition-colors hover:text-foreground/80 text-foreground/60 whitespace-nowrap"
          >
            {t("nav.docs")}
          </Link>
          <Link
            to="/docs/api-reference"
            className="transition-colors hover:text-foreground/80 text-foreground/60 whitespace-nowrap"
          >
            {t("nav.apiReference")}
          </Link>
        </nav>

        {/* Right side controls */}
        <div
          className={cn("flex items-center shrink-0", isRTL ? "gap-2 mr-auto" : "gap-2 ml-auto")}
        >
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/tabaqatdev/geocoding-wasm"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}

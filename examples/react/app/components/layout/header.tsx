import { MapPin, Github, Menu } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { useTranslation } from "~/i18n/context";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { t, language } = useTranslation();

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex h-full items-center justify-between px-4 max-w-7xl mx-auto">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm sm:text-base truncate max-w-[150px] sm:max-w-none">
              {language === "ar" ? "الترميز الجغرافي" : "Geocoding SDK"}
            </span>
          </Link>
        </div>

        {/* Center: Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link
            to="/playground"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("nav.playground")}
          </Link>
          <Link
            to="/docs/getting-started"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("nav.docs")}
          </Link>
          <Link
            to="/docs/api-reference"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("nav.apiReference")}
          </Link>
        </nav>

        {/* Right: Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild className="hidden sm:flex">
            <a
              href="https://github.com/tabaqatdev/geocoding-sdk"
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

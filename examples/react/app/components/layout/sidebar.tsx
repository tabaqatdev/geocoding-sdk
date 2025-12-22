import { NavLink } from "react-router";
import { cn } from "~/lib/utils";
import { useTranslation } from "~/i18n/context";
import {
  Home,
  Play,
  BookOpen,
  MapPin,
  RotateCcw,
  Mail,
  Hash,
  Globe,
  Layers,
  Code,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";

interface SidebarProps {
  className?: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar({ className }: SidebarProps) {
  const { t, language } = useTranslation();
  const isRTL = language === "ar";

  const sections: NavSection[] = [
    {
      title: "",
      items: [
        { title: t("nav.home"), href: "/", icon: Home },
        { title: t("nav.playground"), href: "/playground", icon: Play },
      ],
    },
    {
      title: t("nav.docs"),
      items: [
        { title: t("nav.gettingStarted"), href: "/docs/getting-started", icon: BookOpen },
        { title: t("nav.forwardGeocoding"), href: "/docs/forward-geocoding", icon: MapPin },
        { title: t("nav.reverseGeocoding"), href: "/docs/reverse-geocoding", icon: RotateCcw },
        { title: t("nav.postcodeSearch"), href: "/docs/postcode-search", icon: Mail },
        { title: t("nav.houseNumber"), href: "/docs/house-number", icon: Hash },
        { title: t("nav.countryDetection"), href: "/docs/country-detection", icon: Globe },
        { title: t("nav.adminHierarchy"), href: "/docs/admin-hierarchy", icon: Layers },
        { title: t("nav.apiReference"), href: "/docs/api-reference", icon: Code },
      ],
    },
  ];

  return (
    <div className={cn("pb-12", className)} dir={isRTL ? "rtl" : "ltr"}>
      <ScrollArea className={cn("h-full py-6", isRTL ? "pr-4 pl-6" : "pl-4 pr-6")}>
        <div className="space-y-6">
          {sections.map((section, i) => (
            <div key={i} className="space-y-2">
              {section.title && (
                <h4
                  className={cn(
                    "font-semibold text-sm text-muted-foreground px-2 mb-2",
                    isRTL ? "text-right" : "text-left"
                  )}
                >
                  {section.title}
                </h4>
              )}
              <nav className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.href === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
                        isRTL ? "flex-row-reverse" : "",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                      )
                    }
                  >
                    <item.icon className={cn("h-4 w-4 shrink-0", isRTL ? "ml-3" : "mr-3")} />
                    <span className={cn("flex-1", isRTL ? "text-right" : "text-left")}>
                      {item.title}
                    </span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

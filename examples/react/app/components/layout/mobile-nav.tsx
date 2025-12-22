import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { MapPin } from "lucide-react";
import { useTranslation } from "~/i18n/context";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const { t, direction } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={direction === "rtl" ? "right" : "left"} className="w-80 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t("common.appName")}
          </SheetTitle>
        </SheetHeader>
        <Sidebar className="px-2" />
      </SheetContent>
    </Sheet>
  );
}

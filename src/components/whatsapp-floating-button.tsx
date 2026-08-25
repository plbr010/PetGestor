import { MessageCircle } from "lucide-react";

import { brand } from "@/config/brand";
import { buildWhatsAppUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";

const SUPPORT_ARIA_LABEL =
  "Ficou com dúvida? Fale no WhatsApp com o suporte do PetGestor";

export function WhatsAppFloatingButton({
  className,
}: {
  className?: string;
}) {
  const href = buildWhatsAppUrl(
    brand.supportWhatsApp.phoneLocal,
    brand.supportWhatsApp.prefillMessage,
  );

  if (!href) {
    return null;
  }

  return (
    <div
      className={cn(
        "whatsapp-float-attention fixed z-50",
        "bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]",
        className,
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={SUPPORT_ARIA_LABEL}
        className={cn(
          "group flex items-center gap-3 rounded-full bg-[#25D366] text-white",
          "shadow-lg shadow-[#25D366]/35",
          "transition-[transform,box-shadow,background-color] duration-200 ease-out",
          "hover:scale-[1.03] hover:bg-[#1ebe57] hover:shadow-xl hover:shadow-[#25D366]/45",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "size-14 justify-center sm:size-auto sm:px-4 sm:py-3",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 sm:size-9">
          <MessageCircle className="size-6 sm:size-5" aria-hidden />
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="text-sm font-semibold tracking-tight">
            Ficou com dúvida?
          </span>
          <span className="text-xs font-medium text-white/90">
            Fale no WhatsApp
          </span>
        </span>
      </a>
    </div>
  );
}

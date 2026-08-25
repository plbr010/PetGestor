import { MessageCircle } from "lucide-react";

import { getSupportWhatsAppHref } from "@/components/whatsapp-floating-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardWhatsAppButton() {
  const href = getSupportWhatsAppHref();

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp com o suporte do PetGestor"
      className={cn(
        buttonVariants({ variant: "outline", size: "icon" }),
        "border-[#25D366]/40 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 hover:text-[#075E54]",
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
    </a>
  );
}

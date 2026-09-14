import { MAIN_CONTENT_ID } from "@/config/public-routes";

export function SkipToContent() {
  return (
    <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">
      Ir para o conteúdo principal
    </a>
  );
}

import { Suspense } from "react";

import { MetaPixel } from "@/components/analytics/meta-pixel";

/** Suspense boundary exigido por useSearchParams no App Router. */
export function MetaPixelRoot() {
  return (
    <Suspense fallback={null}>
      <MetaPixel />
    </Suspense>
  );
}

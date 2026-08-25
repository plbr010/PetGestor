"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

import {
  getMetaPixelId,
  META_CONV_QUERY,
  META_CONV_TRIAL_STARTED,
  trackMetaCompleteRegistration,
  trackMetaPageView,
  trackMetaStartTrial,
} from "@/lib/analytics/meta-pixel";

/**
 * Carrega o Pixel (produção / debug) e PageView nas mudanças de rota.
 * PageView inicial vem do snippet (evita corrida com o carregamento do script).
 * CompleteRegistration + StartTrial via query pós-criação da empresa/trial.
 */
export function MetaPixel() {
  const pixelId = getMetaPixelId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSpaPath = useRef<string | null>(null);
  const isFirstRouteEffect = useRef(true);
  const conversionHandled = useRef(false);

  useEffect(() => {
    if (!pixelId) {
      return;
    }

    const pathKey = `${pathname}?${searchParams.toString()}`;

    if (isFirstRouteEffect.current) {
      isFirstRouteEffect.current = false;
      lastSpaPath.current = pathKey;
      return;
    }

    if (lastSpaPath.current === pathKey) {
      return;
    }

    lastSpaPath.current = pathKey;
    trackMetaPageView();
  }, [pixelId, pathname, searchParams]);

  useEffect(() => {
    if (!pixelId || conversionHandled.current) {
      return;
    }

    if (searchParams.get(META_CONV_QUERY) !== META_CONV_TRIAL_STARTED) {
      return;
    }

    conversionHandled.current = true;
    trackMetaCompleteRegistration();
    trackMetaStartTrial();

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete(META_CONV_QUERY);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [pixelId, searchParams]);

  if (!pixelId) {
    return null;
  }

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

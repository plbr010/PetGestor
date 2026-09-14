import { ImageResponse } from "next/og";

import { brand } from "@/config/brand";

export const alt = brand.defaultTitle;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #ecfdf7 0%, #f8fafc 50%, #ffffff 100%)",
          color: "#134e4a",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, fontWeight: 600 }}>{brand.name}</div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 980,
          }}
        >
          {brand.tagline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 26,
            color: "#3f3f46",
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Agenda, tutores, pets, atendimentos, financeiro, estoque, PDV e relatórios em um só
          lugar.
        </div>
      </div>
    ),
    { ...size },
  );
}

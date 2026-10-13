import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trade Monitor",
    short_name: "Trade Monitor",
    description: "วิเคราะห์หุ้น US และ Crypto สำหรับสวิงเทรด",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0915",
    theme_color: "#0a0915",
    lang: "th",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

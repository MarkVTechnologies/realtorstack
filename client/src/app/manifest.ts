import type { MetadataRoute } from "next";

/** PWA manifest — realtors add the dashboard to their home screen (MVP is a mobile-first PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RealtorStack",
    short_name: "RealtorStack",
    description: "Your property sites, leads and commissions in one place.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#0f5132",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

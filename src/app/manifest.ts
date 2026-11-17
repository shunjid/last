import type { MetadataRoute } from "next";

// Installability matters for notifications: iOS only allows them once the app
// has been added to the Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#121714",
    description: "Browse and continue your local Claude Code terminal sessions.",
    display: "standalone",
    icons: [{ sizes: "any", src: "/icon.svg", type: "image/svg+xml" }],
    name: "LAST",
    short_name: "LAST",
    start_url: "/",
    theme_color: "#121714",
  };
}

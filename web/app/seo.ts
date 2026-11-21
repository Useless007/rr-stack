import type { MetaDescriptor } from "react-router";

declare global {
  interface ImportMetaEnv {
    /** The site's public origin, from SITE_URL at build time (vite.config.ts). */
    readonly SITE_URL: string;
  }
}

/** Pages search engines should find: prerendered (react-router.config.ts) and listed in /sitemap.xml. */
export const publicPages = ["/", "/how-it-works", "/api-reference"];

// react-router.config.ts imports this file outside Vite: keep imports type-only and relative (no
// `~/`), and read import.meta.env only inside functions.

/** Absolute URL on this site. */
export const siteUrl = (path: string) => new URL(path, import.meta.env.SITE_URL).href;

/** Title, description, canonical link and share card (Open Graph, which X and LinkedIn also read). */
export function seo({ title, description, path }: { title: string; description: string; path: string }): MetaDescriptor[] {
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: siteUrl(path) },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "RR stack" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: siteUrl(path) },
    { property: "og:image", content: siteUrl("/og.png") },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "RR stack: a Rust crab holding the React logo" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** For pages that must stay out of search results: signed-in pages, sign-in, not found. */
export const noindex: MetaDescriptor = { name: "robots", content: "noindex" };

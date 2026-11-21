import { siteUrl } from "~/seo";

// Prerendered to build/client/robots.txt. /api/health stays open: the home page shows it.
export function loader() {
  return new Response(`User-agent: *\nAllow: /api/health\nDisallow: /api/\n\nSitemap: ${siteUrl("/sitemap.xml")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

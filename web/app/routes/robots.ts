import { siteUrl } from "~/seo";

// Prerendered to build/client/robots.txt.
export function loader() {
  return new Response(`User-agent: *\nDisallow: /api/\n\nSitemap: ${siteUrl("/sitemap.xml")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

import { publicPages, siteUrl } from "~/seo";

// Prerendered to build/client/sitemap.xml from the same list that is prerendered as pages.
export function loader() {
  const urls = publicPages.map((path) => `  <url><loc>${siteUrl(path)}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

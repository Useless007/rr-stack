import { data, Link } from "react-router";
import { noindex } from "~/seo";

// Rendered on the server, so the address answers 404 instead of a page that says "not found" with a 200.
export function loader() {
  return data(null, { status: 404 });
}

export function meta() {
  return [{ title: "Page not found · RR stack" }, noindex];
}
export default function NotFound() {
  return (
    <div className="mt-20">
      <h1 className="text-4xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="muted mt-4">The address may be mistyped, or the page was moved.</p>
      <p className="mt-8">
        <Link className="btn" to="/">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}

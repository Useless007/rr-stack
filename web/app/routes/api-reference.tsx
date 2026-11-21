import spec from "../../../openapi.json";
import type { Route } from "./+types/api-reference";
import { seo } from "~/seo";

export function meta({}: Route.MetaArgs) {
  return seo({
    title: "API reference · RR stack",
    description: "Every endpoint of the RR stack API, read from openapi.json when the site was built.",
    path: "/api-reference",
  });
}

type Operation = {
  operationId?: string;
  description?: string;
  parameters?: { name: string; in: string; required?: boolean; description?: string }[];
  requestBody?: unknown;
  responses: Record<string, { description?: string }>;
};

// Built from openapi.json at build time: this page is prerendered and never calls the API.
const endpoints = Object.entries(spec.paths as Record<string, Record<string, Operation>>).flatMap(([path, ops]) =>
  Object.entries(ops).map(([method, op]) => ({ path, method: method.toUpperCase(), op })),
);

const methodColor: Record<string, string> = {
  GET: "text-patina-deep dark:text-patina",
  POST: "text-ink dark:text-paper",
  PATCH: "text-ink dark:text-paper",
  DELETE: "text-fault-deep dark:text-fault",
};

export default function ApiReference() {
  return (
    <>
      <h1 className="mt-16 text-4xl font-semibold tracking-tight">API reference</h1>
      <p className="muted mt-4 max-w-[60ch] text-lg leading-relaxed">
        Read from <code className="font-mono text-[0.9em]">openapi.json</code> when the site was built. The same file
        generates the TypeScript client, so this list and the client cannot disagree.
      </p>

      <ul className="mt-12 divide-y divide-ink/10 border-y border-ink/10 dark:divide-paper/10 dark:border-paper/10">
        {endpoints.map(({ path, method, op }) => (
          <li key={method + path} className="py-5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className={`w-16 shrink-0 font-mono text-sm font-medium ${methodColor[method] ?? ""}`}>{method}</span>
              <code className="font-mono [overflow-wrap:anywhere]">{path}</code>
              {op.operationId && <span className="muted text-sm">{op.operationId}</span>}
            </div>
            <div className="mt-2 pl-0 sm:pl-[4.75rem]">
              {op.parameters?.map((p) => (
                <p key={p.name} className="muted text-sm">
                  <code className="font-mono">{p.name}</code> in {p.in}
                  {p.required ? ", required" : ""}
                  {p.description ? `. ${p.description}` : ""}
                </p>
              ))}
              <p className="mt-1 text-sm">
                {Object.keys(op.responses).map((code) => (
                  <span
                    key={code}
                    className={`mr-2 inline-block rounded px-1.5 font-mono text-xs leading-5 ${code.startsWith("2") ? "bg-patina/15" : "bg-fault/15"}`}
                  >
                    {code}
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
        <li className="py-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-16 shrink-0 font-mono text-sm font-medium text-patina-deep dark:text-patina">WS</span>
            <code className="font-mono">/api/events</code>
            <span className="muted text-sm">TodoEvent</span>
          </div>
          <p className="muted mt-2 text-sm sm:pl-[4.75rem]">
            WebSocket. Sends a <code className="font-mono">TodoEvent</code> (created, updated or deleted) for every change.
            The type is in the contract, so the client is typed too.
          </p>
        </li>
      </ul>
    </>
  );
}

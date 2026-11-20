"use client";

import { useMemo, useState } from "react";
import type { ApiKeyRecord } from "./dashboard-types";

const endpoints = [
  { label: "GET /api/plans", method: "GET", path: "/api/plans" },
  { label: "POST /api/pull", method: "POST", path: "/api/pull" },
] as const;

export function ApiPlayground({ keys }: { keys: ApiKeyRecord[] }) {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(0);
  const [keyId, setKeyId] = useState("");
  const [payload, setPayload] = useState('{"subscription_id":""}');
  const [result, setResult] = useState<{ status: number; data: unknown } | null>(null);
  const [language, setLanguage] = useState<"curl" | "javascript" | "python">("curl");
  const selected = endpoints[endpoint];
  const key = keys.find(item => item.id === keyId);
  // API secrets must never be embedded in shareable snippets or persisted to storage.
  const snippet = useMemo(() => {
    const url = `https://api.orbit.example${selected.path}`;
    if (language === "curl") return `curl -X ${selected.method} '${url}' -H 'Authorization: Bearer $ORBIT_API_KEY' -H 'Content-Type: application/json'${selected.method === "POST" ? ` --data '${payload.replace(/'/g, "'\\''")}'` : ""}`;
    if (language === "python") return `import os, requests\nresponse = requests.request("${selected.method}", "${url}", headers={"Authorization": "Bearer " + os.environ["ORBIT_API_KEY"]}, ${selected.method === "POST" ? "json=" + JSON.stringify({ subscription_id: "" }) : ""})`;
    return `const response = await fetch("${url}", { method: "${selected.method}", headers: { Authorization: \`Bearer \${process.env.ORBIT_API_KEY}\` }${selected.method === "POST" ? ", body: JSON.stringify({ subscription_id: \"\" })" : ""} });\nconsole.log(await response.json());`;
  }, [selected, language, payload]);
  const safeSnippet = snippet;
  function run() {
    try {
      const params = selected.method === "POST" ? JSON.parse(payload) : null;
      setResult({ status: 200, data: { mode: "mock", endpoint: selected.path, method: selected.method, params, key_label: key?.name ?? null, note: "No live request was sent. Backend API and scope enforcement are not connected." } });
    } catch {
      setResult({ status: 400, data: { error: "Invalid JSON request body" } });
    }
  }
  return <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
    <div className="flex justify-between items-center"><div><h3 className="font-semibold">API Playground</h3><p className="text-xs text-neutral-500">Safe mock console; never sends real transactions</p></div><button type="button" onClick={() => setOpen(!open)} className="button button-secondary px-3 py-2 text-xs">{open ? "Close" : "Open console"}</button></div>
    {open && <div className="space-y-3">
      <label className="block text-xs">Endpoint<select className="block w-full border rounded p-2 mt-1" value={endpoint} onChange={e => { setEndpoint(Number(e.target.value)); setResult(null); }}>{endpoints.map((e, i) => <option key={e.path} value={i}>{e.label}</option>)}</select></label>
      <label className="block text-xs">Key label (no secret transmitted)<select className="block w-full border rounded p-2 mt-1" value={keyId} onChange={e => setKeyId(e.target.value)}><option value="">No key</option>{keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
      {selected.method === "POST" && <label className="block text-xs">JSON body<textarea className="block w-full border rounded p-2 mt-1 font-mono" rows={3} value={payload} onChange={e => setPayload(e.target.value)} /></label>}
      <button onClick={run} className="button button-primary px-3 py-2 text-xs">Run mock request</button>
      {result && <div role="status"><p className="text-xs font-semibold">Mock HTTP {result.status}</p><pre className="bg-neutral-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(result.data, null, 2)}</pre></div>}
      <div className="flex gap-2">{(["curl","javascript","python"] as const).map(lang => <button key={lang} type="button" aria-pressed={language === lang} onClick={() => setLanguage(lang)} className="text-xs border rounded px-2 py-1">{lang}</button>)}</div>
      <pre className="bg-neutral-900 text-white p-3 rounded text-xs overflow-x-auto">{safeSnippet}</pre>
      <button type="button" className="button button-secondary px-3 py-2 text-xs" onClick={() => navigator.clipboard.writeText(safeSnippet)}>Copy snippet</button>
      <p className="text-xs text-amber-700">Replace the example API host and provide your key through an environment variable. This playground does not enforce scopes or call the production API.</p>
    </div>}
  </section>;
}

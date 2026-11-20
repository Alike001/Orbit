"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ORBIT_API_URL, merchantRequestHeaders } from "@/lib/api";

interface Plan { id: string; name: string; usdc_amount: number; interval_seconds: number; currency?: string }
export interface HostedLink {
  id: string;
  plan_id: string;
  title: string;
  cta_text: string;
  accent_color: string;
  redirect_url: string | null;
  collect_email: boolean;
  collect_discord: boolean;
  active: boolean;
  logo_url?: string | null;
  headline?: string | null;
  terms_url?: string | null;
  plans?: Plan;
}
interface Props { isOpen: boolean; onClose: () => void; onCreateLink: (link: HostedLink) => void; }

export function CreatePaymentLinkModal({ isOpen, onClose, onCreateLink }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [cta, setCta] = useState("Pay with USDC");
  const [accent, setAccent] = useState("#111827");
  const [redirect, setRedirect] = useState("");
  const [email, setEmail] = useState(false);
  const [discord, setDiscord] = useState(false);
  const [previewTermsChecked, setPreviewTermsChecked] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<HostedLink | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch(`${ORBIT_API_URL}/payment-links/plans`, { headers: merchantRequestHeaders(), signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load merchant plans. Connect a valid merchant API key."); return response.json(); })
      .then((data: { plans: Plan[] }) => { setPlans(data.plans); setPlanId(previous => previous || data.plans[0]?.id || ""); })
      .catch(reason => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [isOpen]);

  if (!isOpen) return null;
  const currentPlan = plans.find(p => p.id === planId);
  const url = created && typeof window !== "undefined" ? `${window.location.origin}/pay/${created.id}` : "";

  const validateUrl = (u: string, fieldName: string): boolean => {
    if (!u.trim()) return true;
    try {
      const parsed = new URL(u.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`${fieldName} must use http:// or https:// protocol.`);
      }
      return true;
    } catch {
      setError(`Invalid ${fieldName}. Please enter a valid URL.`);
      return false;
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!currentPlan) { setError("Select a valid existing plan."); return; }
    if (redirect.trim() && !validateUrl(redirect, "Completion redirect URL")) return;
    if (logoUrl.trim() && !validateUrl(logoUrl, "Brand logo URL")) return;
    if (termsUrl.trim() && !validateUrl(termsUrl, "Terms & conditions URL")) return;

    setWorking(true);
    try {
      const response = await fetch(`${ORBIT_API_URL}/payment-links`, {
        method: "POST",
        headers: merchantRequestHeaders(),
        body: JSON.stringify({
          plan_id: planId,
          title: title.trim(),
          headline: headline.trim() || null,
          logo_url: logoUrl.trim() || null,
          terms_url: termsUrl.trim() || null,
          cta_text: cta.trim(),
          accent_color: accent,
          redirect_url: redirect.trim() || null,
          collect_email: email,
          collect_discord: discord,
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save payment link");
      const link: HostedLink = {
        ...result.link,
        logo_url: logoUrl.trim() || null,
        headline: headline.trim() || null,
        terms_url: termsUrl.trim() || null,
        plans: currentPlan
      };
      onCreateLink(link);
      setCreated(link);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save link");
    } finally {
      setWorking(false);
    }
  };

  const qrImage = (format: "png" | "svg") => `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=${format}&data=${encodeURIComponent(url)}`;
  const copy = (text: string) => void navigator.clipboard.writeText(text);

  return (
    <div role="presentation" className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="payment-link-title" className="mx-auto my-6 w-full max-w-5xl rounded-xl bg-white p-6 text-black shadow-xl" onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <div className="mb-5 flex justify-between items-center gap-4 border-b border-black/10 pb-4">
          <div>
            <h2 id="payment-link-title" className="text-xl font-bold">
              {created ? "Share payment link" : "Hosted Checkout Customizer"}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Customize brand branding, header graphics, redirect rules, and terms agreement with live preview.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close payment link wizard" className="rounded-lg border px-3 py-1.5 text-xs hover:bg-neutral-50">
            Close
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm">Your custom branded checkout link is saved on Orbit and ready to share.</p>
            <input readOnly value={url} aria-label="Hosted checkout URL" className="w-full rounded border p-3 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-black px-4 py-2 text-white text-xs font-semibold" onClick={() => copy(url)}>Copy URL</button>
              <button className="rounded border px-4 py-2 text-xs font-medium" onClick={() => copy(`<a href="${url}">Pay with Orbit</a>`)}>Copy embed snippet</button>
              <a className="rounded border px-4 py-2 text-xs font-medium" href={qrImage("svg")} download="orbit-checkout.svg" target="_blank" rel="noreferrer">Download SVG QR</a>
              <a className="rounded border px-4 py-2 text-xs font-medium" href={qrImage("png")} download="orbit-checkout.png" target="_blank" rel="noreferrer">Download PNG QR</a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImage("png")} width={160} height={160} alt="QR code for hosted checkout" className="rounded-lg border p-1" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: Customizer Form */}
            <form onSubmit={submit} className="space-y-3.5 lg:col-span-6">
              <label className="block text-xs font-semibold text-neutral-700">
                Linked Plan <span className="text-red-500">*</span>
                <select required value={planId} onChange={e => setPlanId(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs">
                  <option value="">Select plan</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({(Number(p.usdc_amount) / 1e7).toFixed(2)} USDC)</option>)}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Checkout Title <span className="text-red-500">*</span>
                  <input required maxLength={140} placeholder="e.g. Pro Monthly Membership" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Custom Header Headline
                  <input maxLength={140} placeholder="e.g. Unlock unlimited access" value={headline} onChange={e => setHeadline(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Brand Logo URL
                  <input type="url" placeholder="https://example.com/logo.png" value={logoUrl} onChange={e => { setLogoUrl(e.target.value); setPreviewImgError(false); }} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Brand Color Accent
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="w-8 h-8 rounded border border-black/10 cursor-pointer" />
                    <input type="text" value={accent} onChange={e => setAccent(e.target.value)} className="w-full rounded-lg border border-black/10 p-2 text-xs font-mono uppercase" />
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Terms & Conditions URL
                  <input type="url" placeholder="https://example.com/terms" value={termsUrl} onChange={e => setTermsUrl(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                </label>

                <label className="block text-xs font-semibold text-neutral-700">
                  Button Text (CTA)
                  <input required maxLength={80} value={cta} onChange={e => setCta(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                </label>
              </div>

              <label className="block text-xs font-semibold text-neutral-700">
                Post-Checkout Redirect URL (HTTPS)
                <input type="url" pattern="https://.*" placeholder="https://example.com/checkout/success" value={redirect} onChange={e => setRedirect(e.target.value)} className="mt-1 block w-full rounded-lg border border-black/10 p-2 text-xs" />
                <span className="text-[10px] text-neutral-500 mt-0.5 block">
                  Customers are redirected here automatically upon settlement with ?vault_id=…&amp;tx_hash=…
                </span>
              </label>

              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} className="rounded border-black/20 text-black focus:ring-black" />
                  Collect customer email
                </label>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={discord} onChange={e => setDiscord(e.target.checked)} className="rounded border-black/20 text-black focus:ring-black" />
                  Collect Discord handle
                </label>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={working || !planId} className="w-full rounded-lg bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50">
                  {working ? "Saving Link Customizations…" : "Create Branded Checkout Link"}
                </button>
              </div>
            </form>

            {/* Right: Side-by-Side Dynamic Mock Preview */}
            <section aria-label="Live checkout preview" className="rounded-xl bg-neutral-100/80 border border-black/10 p-4 lg:col-span-6 flex flex-col justify-between">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Live Dynamic Preview
                  </span>
                  <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-black/10 text-xs">
                    <button type="button" onClick={() => setMode("desktop")} className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${mode === "desktop" ? "bg-black text-white" : "text-neutral-600 hover:text-black"}`}>
                      Desktop
                    </button>
                    <button type="button" onClick={() => setMode("mobile")} className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${mode === "mobile" ? "bg-black text-white" : "text-neutral-600 hover:text-black"}`}>
                      Mobile
                    </button>
                  </div>
                </div>

                <div className={`mx-auto rounded-xl bg-white border border-black/10 p-5 shadow-sm transition-all duration-200 ${mode === "mobile" ? "max-w-[300px]" : "w-full"}`}>
                  {/* Brand Header */}
                  <div className="flex items-center gap-3 pb-3 border-b border-black/5">
                    {logoUrl && !previewImgError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt="Brand Logo Preview"
                        className="w-8 h-8 rounded-full object-cover border border-black/10"
                        onError={() => setPreviewImgError(true)}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: accent }}>
                        {title.slice(0, 1).toUpperCase() || "O"}
                      </div>
                    )}
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Merchant Checkout</div>
                      <div className="text-xs font-bold text-black truncate max-w-[200px]">
                        {headline || "Verified Orbit Merchant"}
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="mt-4 space-y-3">
                    <h3 className="text-base font-bold text-black leading-snug">
                      {title || "Subscription Checkout"}
                    </h3>
                    <div className="flex justify-between items-baseline border-y border-neutral-100 py-2.5">
                      <span className="text-xs text-neutral-500">{currentPlan?.name || "Selected Plan"}</span>
                      <strong className="text-base font-mono font-bold text-black">
                        ${currentPlan ? (Number(currentPlan.usdc_amount) / 1e7).toFixed(2) : "0.00"} USDC
                      </strong>
                    </div>

                    {email && (
                      <input disabled placeholder="customer@domain.com" className="w-full rounded-md border border-neutral-200 p-2 text-[11px] bg-neutral-50" />
                    )}
                    {discord && (
                      <input disabled placeholder="username#0000" className="w-full rounded-md border border-neutral-200 p-2 text-[11px] bg-neutral-50" />
                    )}

                    {termsUrl && (
                      <label className="flex items-start gap-2 text-[11px] text-neutral-600 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={previewTermsChecked}
                          onChange={e => setPreviewTermsChecked(e.target.checked)}
                          className="mt-0.5 rounded border-black/20 text-black focus:ring-black"
                        />
                        <span>
                          I agree to the{" "}
                          <span className="underline font-medium text-black">
                            Terms &amp; Conditions
                          </span>
                        </span>
                      </label>
                    )}

                    <button
                      type="button"
                      disabled={Boolean(termsUrl && !previewTermsChecked)}
                      style={{ backgroundColor: accent }}
                      className="w-full rounded-lg p-2.5 text-xs font-bold text-white shadow-xs disabled:opacity-40 transition-opacity"
                    >
                      {cta || "Pay with USDC"}
                    </button>
                    {termsUrl && !previewTermsChecked && (
                      <p className="text-[10px] text-amber-700 text-center">
                        Must accept terms before authorizing wallet
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {redirect && (
                <div className="mt-3 p-2.5 rounded-lg bg-white border border-black/5 text-[11px] text-neutral-600">
                  <span className="font-semibold text-black">Post-Settlement Redirect:</span>
                  <div className="font-mono text-[10px] truncate mt-0.5 text-neutral-500">{redirect}</div>
                </div>
              )}
            </section>
          </div>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      </div>
    </div>
  );
}

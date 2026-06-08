/* ── Free-plan premium-feature trial ──────────────────────────────────────────
   Free (Starter) shops get full access to premium features for a trial window
   (default 45 days from install). After it ends, premium features lock until they
   upgrade to a paid plan. Paid plans and freeForever shops are NEVER locked.

   Premium = Freebie, Upsell, AI-powered Upsell.

   Trial length is per-shop via CartSettings.trialDays (default 45). Change it for a
   specific shop directly in the DB, e.g.:
     UPDATE "CartSettings" SET "trialDays" = 60 WHERE shop = 'xyz.myshopify.com';
   Set 0 to expire immediately (testing); higher to extend.
*/
export const DEFAULT_TRIAL_DAYS = 45;

export function isPremiumLocked(settings) {
  if (!settings) return false;                       // no row yet → brand new, within trial
  const plan = String(settings.planName || "starter").toLowerCase();
  if (plan !== "starter") return false;              // any paid plan (growth/scale/…)
  if (settings.freeForever) return false;            // manually granted free access
  const days = settings.trialDays != null ? Number(settings.trialDays) : DEFAULT_TRIAL_DAYS;
  if (!Number.isFinite(days)) return false;
  const start = settings.createdAt ? new Date(settings.createdAt).getTime() : Date.now();
  const end = start + days * 24 * 60 * 60 * 1000;
  return Date.now() > end;
}

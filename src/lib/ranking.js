// Signals agent ranking rules (design call #2 in the V1 brief).
// Every score is explainable: four factors, visible weights, a severity rule and a cap.
const clamp = (n) => Math.max(0, Math.min(1, n));
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function growthOf(trend) {
  const first = avg(trend.slice(0, 3));
  const last = avg(trend.slice(-3));
  return first ? (last - first) / first : 0;
}

export function goalMatch(text, goals = []) {
  const t = text.toLowerCase();
  for (const g of goals) {
    const kw = g.keywords.find((k) => t.includes(k.toLowerCase()));
    if (kw) return { goal: g, keyword: kw };
  }
  return null;
}

export function scoreSignal(s, goals, settings) {
  const { weights: w, thresholds: th } = settings;
  const growth = growthOf(s.trend);
  const reach = s.sourceIds.length;
  const fit = goalMatch(s.theme, goals);

  const factors = {
    volume: { strong: s.volume >= th.volume, score: clamp(Math.log10(s.volume + 1) / Math.log10(5001)) },
    trend: { strong: growth >= th.trend, score: clamp((growth + 0.2) / 1.0) },
    reach: { strong: reach >= th.reach, score: clamp(reach / 3) },
    fit: { strong: !!fit, score: fit ? 1 : 0 },
  };
  const wsum = w.volume + w.trend + w.reach + w.fit || 1;
  const score = Math.round(
    (100 * (w.volume * factors.volume.score + w.trend * factors.trend.score + w.reach * factors.reach.score + w.fit * factors.fit.score)) / wsum
  );
  const strong = Object.values(factors).filter((f) => f.strong).length;
  const severity = strong >= 3 ? "High" : strong >= 2 ? "Medium" : "Low";
  const trendLabel = growth >= 0.1 ? "growing" : growth <= -0.1 ? "shrinking" : "flat";
  const pct = `${growth >= 0 ? "+" : ""}${Math.round(growth * 100)}%`;
  const why = [
    `${s.volume.toLocaleString()} ${s.unit}`,
    `${trendLabel} ${pct} over 8 wks`,
    `${reach} source${reach === 1 ? "" : "s"} agree${reach === 1 ? "s" : ""}`,
    fit ? `fits “${fit.goal.text}”` : "no goal match",
  ].join(" · ");
  return { ...s, score, severity, strong, growth, trendLabel, reach, fit, factors, why };
}

export function rankSignals(signals, goals, settings) {
  const scored = signals.map((s) => scoreSignal(s, goals, settings)).sort((a, b) => b.score - a.score);
  const active = scored.filter((s) => !s.muted);
  return {
    top: active.slice(0, settings.cap),
    rest: active.slice(settings.cap),
    muted: scored.filter((s) => s.muted),
    all: scored,
  };
}

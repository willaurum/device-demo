// ============================================================================
// alerts.js  --  derive alerts from live device data
// ----------------------------------------------------------------------------
// The dashboard has an "Active Alerts" KPI and a "Recent Alerts" feed. Rather
// than fake those, we COMPUTE them from the real device state with a few simple
// rules. This is a lightweight stand-in for a real alerting engine (which would
// live in the backend, with per-deployment thresholds and notifications) -- but
// it's honest: every alert here reflects something actually true of a device.
//
// THRESHOLDS would become per-deployment configuration in a real product. They
// live here, in one place, so they're easy to find and tune.
// ============================================================================

const THRESHOLDS = {
  highTemperature: 26,   // °C  -> critical
  highHumidity: 54,      // %   -> warning
};

// Build the alert list from the current devices. Each alert:
//   { key, severity: 'critical'|'warning'|'info', title, sub, ts }
// `key` is stable per (device, rule) so React lists stay calm across updates.
export function computeAlerts(devices) {
  const alerts = [];

  for (const d of devices) {
    const label = d.name || d.id;
    const where = d.location || d.id;

    // Offline is always worth surfacing.
    if (!d.online) {
      alerts.push({
        key: `${d.id}:offline`,
        severity: 'warning',
        title: `${label} went offline`,
        sub: `${d.id} · ${where}`,
        ts: d.last_seen,
      });
      // If it's offline its readings are stale, so skip the value rules.
      continue;
    }

    const temp = d.latest?.temperature;
    if (typeof temp === 'number' && temp >= THRESHOLDS.highTemperature) {
      alerts.push({
        key: `${d.id}:temp`,
        severity: 'critical',
        title: `High temp on ${label}`,
        sub: `${d.id} · ${temp.toFixed(1)}°C`,
        ts: d.last_seen,
      });
    }

    const hum = d.latest?.humidity;
    if (typeof hum === 'number' && hum >= THRESHOLDS.highHumidity) {
      alerts.push({
        key: `${d.id}:hum`,
        severity: 'warning',
        title: `Humidity spike on ${label}`,
        sub: `${d.id} · ${hum.toFixed(1)}%`,
        ts: d.last_seen,
      });
    }
  }

  // Most severe first, then most recent.
  const rank = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return new Date(b.ts || 0) - new Date(a.ts || 0);
  });

  return alerts;
}

// ----------------------------------------------------------------------------
// mergeAlertLog  --  fold the CURRENTLY-active alerts into a persistent log.
// ----------------------------------------------------------------------------
// computeAlerts() only reports what's true right now, so an alert vanishes the
// moment its condition clears. The dashboard instead keeps a LOG: once an alert
// fires it stays in the list (so it can be reviewed in the Alerts tab), even
// after it resolves. Each log entry tracks:
//   firstSeen  when it first fired        active  is the condition still true?
//   read       has the user seen it?      severity/title/sub  captured at firing
//
// We return the SAME array reference when nothing changed, so React can skip a
// re-render (important: this runs on every device update). Note we deliberately
// don't rewrite title/sub for a still-active alert each tick -- the log records
// the event as first seen, and that keeps updates (and re-renders) to a minimum.
const LOG_CAP = 200;

export function mergeAlertLog(prev, active, now) {
  const activeByKey = new Map(active.map((a) => [a.key, a]));
  const known = new Set(prev.map((r) => r.key));
  let changed = false;

  const next = prev.map((r) => {
    const a = activeByKey.get(r.key);
    if (a) {
      // Was resolved and just fired again -> reactivate + mark unread.
      if (!r.active) { changed = true; return { ...r, active: true, read: false, lastSeen: now }; }
      return r;                                  // still active, no change
    }
    // No longer active -> mark resolved (but keep it in the log).
    if (r.active) { changed = true; return { ...r, active: false, lastSeen: now }; }
    return r;
  });

  // Brand-new alerts we've never logged before.
  for (const a of active) {
    if (!known.has(a.key)) {
      next.push({
        key: a.key, severity: a.severity, title: a.title, sub: a.sub,
        firstSeen: now, lastSeen: now, active: true, read: false,
      });
      changed = true;
    }
  }

  if (!changed) return prev;
  // Cap the log so it can't grow without bound (newest kept).
  return next.length > LOG_CAP
    ? [...next].sort((x, y) => y.firstSeen - x.firstSeen).slice(0, LOG_CAP)
    : next;
}

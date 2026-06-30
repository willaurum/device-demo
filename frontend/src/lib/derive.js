// ============================================================================
// derive.js  --  pure functions that turn the raw device list into the numbers
//                the dashboard shows (KPIs, type counts, columns, CSV, ...).
// ----------------------------------------------------------------------------
// Keeping these as plain functions (no React) makes them easy to read and test,
// and keeps the components focused on layout. Everything here is computed from
// the REAL device data the backend sends -- nothing is faked.
// ============================================================================

// A small palette used to colour device types in the donut + legend. Types are
// coloured by their position in the sorted list, so any set of types gets
// stable, distinct colours without us hard-coding type names.
export const PALETTE = ['#3fd1a3', '#4aa3ff', '#f2b134', '#b692ff', '#ff6b6b', '#46d3eb'];

// ---- Columns (capability-driven) -------------------------------------------
// Walk every device's capabilities and collect the distinct telemetry metrics
// and controls across the whole fleet. Different device types contribute
// different columns; a device simply shows "—" where it lacks one.
export function deriveColumns(devices) {
  const metrics = [];
  const controls = [];
  const seenMetric = new Set();
  const seenControl = new Set();

  for (const d of devices) {
    const caps = d.capabilities || {};
    for (const m of caps.telemetry || []) {
      if (!seenMetric.has(m.metric)) { seenMetric.add(m.metric); metrics.push(m); }
    }
    for (const c of caps.controls || []) {
      if (!seenControl.has(c.key)) { seenControl.add(c.key); controls.push(c); }
    }
  }
  return { metrics, controls };
}

// Pull the sortable value for a device given a column key. Understands the
// fixed columns plus the "m:<metric>" (telemetry) and "c:<key>" (control)
// encodings used by the table headers. Missing values sort low; booleans 0/1.
export function valueForSort(device, key) {
  if (key.startsWith('m:')) return device.latest?.[key.slice(2)] ?? '';
  if (key.startsWith('c:')) {
    const v = device.state?.[key.slice(2)];
    return v === undefined ? '' : (v ? 1 : 0);
  }
  return device[key] ?? '';
}

// ---- Device-type counts (for the donut + legend) ---------------------------
// Returns [{ type, count, color }] sorted by count (largest first).
export function typeCounts(devices) {
  const counts = {};
  for (const d of devices) {
    const t = d.type || 'unknown';
    counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count], i) => ({ type, count, color: PALETTE[i % PALETTE.length] }));
}

// ---- KPI numbers for the four stat cards -----------------------------------
// All real: counts come straight from the device list, the average temperature
// is taken over only the devices that actually report a temperature.
export function computeKpis(devices, alerts) {
  const total = devices.length;
  const online = devices.filter((d) => d.online).length;
  const availabilityPct = total ? Math.round((online / total) * 100) : 0;

  const temps = devices
    .map((d) => d.latest?.temperature)
    .filter((t) => typeof t === 'number');
  const avgTemp = temps.length
    ? temps.reduce((a, b) => a + b, 0) / temps.length
    : null;

  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;

  return {
    total,
    online,
    availabilityPct,
    avgTemp,
    tempCount: temps.length,
    typeCount: new Set(devices.map((d) => d.type).filter(Boolean)).size,
    alertCount: alerts.length,
    critical,
    warning,
  };
}

// ---- A single fleet-average sample (feeds the live telemetry chart) --------
// Averages each requested metric across the devices that currently report it.
// Returns e.g. { temperature: 22.1, humidity: 47.8 } for the current instant.
export function fleetAverage(devices, metrics) {
  const out = {};
  for (const metric of metrics) {
    const vals = devices
      .map((d) => d.latest?.[metric])
      .filter((v) => typeof v === 'number');
    if (vals.length) out[metric] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

// ---- CSV export ------------------------------------------------------------
// Flattens the fleet (one row per device) into CSV text: the fixed fields plus
// one column per telemetry metric and per control found across the fleet.
export function toCsv(devices, metrics, controls) {
  const headers = [
    'id', 'name', 'location', 'type', 'online',
    ...metrics.map((m) => m.metric),
    ...controls.map((c) => c.key),
  ];

  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Quote anything containing a comma, quote, or newline (standard CSV rule).
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  for (const d of devices) {
    const row = [
      d.id, d.name, d.location, d.type, d.online,
      ...metrics.map((m) => d.latest?.[m.metric]),
      ...controls.map((c) => d.state?.[c.key]),
    ];
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}

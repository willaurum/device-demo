// ============================================================================
// DeviceTable.jsx  --  the capability-driven device registry table
// ----------------------------------------------------------------------------
// Extracted from App so both the Dashboard overview and the dedicated Devices
// view can reuse it. It owns its own sorting + type-filter state.
//
// Columns are built from capabilities (passed in as `metrics` / `controls`), so
// the table shows the right columns whether the fleet is environmental sensors,
// flow meters, GPS trackers, or a mix. Click a row to open the detail panel.
// ============================================================================

import React, { useState } from 'react';
import DeviceRow from './DeviceRow.jsx';
import { valueForSort } from '../lib/derive.js';

export default function DeviceTable({ devices, metrics, controls, onOpen }) {
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [typeFilter, setTypeFilter] = useState('all');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // The set of types present, for the filter pills (All / NGI-3000 / ...).
  const types = [...new Set(devices.map((d) => d.type).filter(Boolean))].sort();

  const visible = devices
    .filter((d) => typeFilter === 'all' || d.type === typeFilter)
    .sort((a, b) => {
      const av = valueForSort(a, sortKey);
      const bv = valueForSort(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div>
      {/* type filter pills */}
      <div className="filter-pills">
        <FilterPill label="All" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
        {types.map((t) => (
          <FilterPill key={t} label={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
        ))}
      </div>

      {/* Many device types -> many columns. Wrap in a horizontal scroller so
          the table scrolls left/right cleanly instead of overflowing the page. */}
      <div className="table-scroll">
        <table className="device-table">
          <thead>
            <tr>
              <th></th>
              <SortTh label="Device"   col="name"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Location" col="location" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Type"     col="type"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              {metrics.map((m) => (
                <SortTh key={m.metric} label={m.label} col={`m:${m.metric}`}
                        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              ))}
              {controls.map((c) => (
                <SortTh key={c.key} label={c.label} col={`c:${c.key}`}
                        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                metrics={metrics}
                controls={controls}
                onOpen={() => onOpen(device.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button className={`filter-pill ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function SortTh({ label, col, sortKey, sortDir, onSort }) {
  const active = sortKey === col;
  return (
    <th className={`sortable ${active ? 'sorted' : ''}`} onClick={() => onSort(col)}>
      {label}
      <span className="sort-indicator">
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

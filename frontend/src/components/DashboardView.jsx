// ============================================================================
// DashboardView.jsx  --  the main overview screen
// ----------------------------------------------------------------------------
// Lays out the pieces seen in the mockup:
//   - a row of four KPI stat cards
//   - a large live fleet-telemetry chart
//   - a side column: device-type donut + recent alerts
//   - the device registry table at the bottom
//
// Everything is fed real, derived data from App (see lib/derive.js + alerts.js).
// ============================================================================

import React from 'react';
import StatCard from './StatCard.jsx';
import FleetChart from './FleetChart.jsx';
import Donut from './Donut.jsx';
import AlertsList from './AlertsList.jsx';
import DeviceTable from './DeviceTable.jsx';

export default function DashboardView({
  devices, metrics, controls, alerts, kpis, types, history, onOpen, onViewAll,
}) {
  return (
    <div className="dashboard">
      {/* ---- KPI cards ---- */}
      <div className="kpi-row">
        <StatCard
          label="Total Devices" value={kpis.total}
          sub={`${kpis.typeCount} device type${kpis.typeCount === 1 ? '' : 's'}`}
          accent="#4aa3ff"
        />
        <StatCard
          label="Online" value={kpis.online}
          sub={`${kpis.availabilityPct}% availability`}
          accent="#3fd1a3"
        />
        <StatCard
          label="Active Alerts" value={kpis.alertCount}
          sub={`${kpis.critical} critical · ${kpis.warning} warning`}
          accent="#ff6b6b"
        />
        <StatCard
          label="Avg Temperature"
          value={kpis.avgTemp != null ? `${kpis.avgTemp.toFixed(1)}°` : '—'}
          sub={`${kpis.tempCount} sensor${kpis.tempCount === 1 ? '' : 's'} reporting`}
          accent="#f2b134"
        />
      </div>

      {/* ---- chart + side column ---- */}
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Fleet Telemetry — live</h3>
              <p className="panel-sub">Rolling average across online devices</p>
            </div>
          </div>
          <FleetChart history={history} metrics={metrics} />
        </section>

        <div className="side-column">
          <section className="panel">
            <div className="panel-head"><h3>Device Types</h3></div>
            <div className="types-body">
              <Donut segments={types} />
              <ul className="type-legend">
                {types.map((t) => (
                  <li key={t.type}>
                    <span className="legend-dot" style={{ background: t.color }} />
                    <span className="type-name">{t.type}</span>
                    <span className="type-count">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Recent Alerts</h3>
              {alerts.length > 0 && (
                <button className="link-btn" onClick={onViewAll}>View all</button>
              )}
            </div>
            <AlertsList alerts={alerts} limit={4} />
          </section>
        </div>
      </div>

      {/* ---- registry ---- */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Device Registry</h3>
            <p className="panel-sub">Click a row to inspect</p>
          </div>
        </div>
        <DeviceTable devices={devices} metrics={metrics} controls={controls} onOpen={onOpen} />
      </section>
    </div>
  );
}

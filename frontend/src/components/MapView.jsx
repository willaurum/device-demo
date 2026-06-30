// ============================================================================
// MapView.jsx  --  live location map (only devices that report a position)
// ----------------------------------------------------------------------------
// Shows just the devices whose TYPE declares latitude + longitude telemetry
// (e.g. the GPS-100 asset tracker), on a REAL map: Leaflet + OpenStreetMap.
//
// Why Leaflet + OSM: it's open-source and keyless (no API key, no billing), so
// the template still runs anywhere with just `docker compose up`. The only new
// requirement is internet at runtime to fetch map tiles. We use CARTO's free
// OSM-based basemaps (dark/light to match the dashboard theme) with the
// required attribution.
//
// We drive Leaflet IMPERATIVELY from React (create the map in an effect, keep
// markers in a ref, move them as devices report new positions). This avoids
// pulling in react-leaflet and its React-version coupling -- plain `leaflet`
// is the only dependency.
// ============================================================================

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Free, keyless OSM-based tile sets (CARTO). Two themes so the map matches the
// dashboard. Attribution is required and supplied to the tile layer below.
const TILES = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function MapView({ devices, onOpen, theme }) {
  // "Location devices" = their capabilities include both latitude and longitude.
  const located = devices.filter((d) => {
    const tel = (d.capabilities?.telemetry || []).map((m) => m.metric);
    return tel.includes('latitude') && tel.includes('longitude');
  });
  // Of those, the ones currently reporting a position we can place on the map.
  const withPos = located.filter(
    (d) => typeof d.latest?.latitude === 'number' && typeof d.latest?.longitude === 'number'
  );
  const hasMap = located.length > 0;

  const elRef = useRef(null);        // the map container <div>
  const mapRef = useRef(null);       // the Leaflet map instance
  const tileRef = useRef(null);      // the current tile layer
  const markersRef = useRef({});     // device id -> Leaflet marker
  const fittedRef = useRef(false);   // have we auto-zoomed to the fleet yet?

  // --- create the map once (when there are location devices to show) --------
  useEffect(() => {
    if (!hasMap || !elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([20, 0], 2);
    mapRef.current = map;
    // Leaflet needs a correct container size; nudge it after layout settles.
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersRef.current = {};
      fittedRef.current = false;
    };
  }, [hasMap]);

  // --- swap tiles when the theme changes ------------------------------------
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileRef.current) tileRef.current.remove();
    tileRef.current = L.tileLayer(TILES[theme] || TILES.dark, {
      attribution: ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, [theme, hasMap]);

  // --- add / move / remove markers as devices report positions --------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set();
    for (const d of withPos) {
      seen.add(d.id);
      const latlng = [d.latest.latitude, d.latest.longitude];
      let marker = markersRef.current[d.id];
      if (!marker) {
        // A small dot marker; clicking it opens the device detail panel.
        marker = L.circleMarker(latlng, {
          radius: 7, weight: 2, color: '#3fd1a3', fillColor: '#3fd1a3', fillOpacity: 0.75,
        });
        marker.bindTooltip(d.name || d.id, { direction: 'top', offset: [0, -6] });
        marker.on('click', () => onOpen(d.id));
        marker.addTo(map);
        markersRef.current[d.id] = marker;
      } else {
        marker.setLatLng(latlng);   // device moved -> slide the dot
      }
    }

    // Drop markers for devices that are no longer reporting a position.
    for (const id of Object.keys(markersRef.current)) {
      if (!seen.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    }

    // First time we have positions, zoom to fit the whole fleet.
    if (!fittedRef.current && withPos.length > 0) {
      const bounds = L.latLngBounds(withPos.map((d) => [d.latest.latitude, d.latest.longitude]));
      map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [withPos, onOpen]);

  // --- render ---------------------------------------------------------------
  if (!hasMap) {
    return (
      <div className="panel placeholder">
        <h3>Map</h3>
        <p className="muted">
          No devices report location. Add a device whose type declares
          <code> latitude </code> and <code> longitude </code> telemetry (such as
          the <code>GPS-100</code> asset tracker) and it will appear here.
        </p>
      </div>
    );
  }

  return (
    <section className="panel map-panel">
      <div className="panel-head">
        <div>
          <h3>Map</h3>
          <p className="panel-sub">
            {withPos.length} of {located.length} location device{located.length === 1 ? '' : 's'} · live positions
          </p>
        </div>
      </div>
      <div ref={elRef} className="map-leaflet" />
      <p className="muted map-note">Click a marker to inspect the device.</p>
    </section>
  );
}

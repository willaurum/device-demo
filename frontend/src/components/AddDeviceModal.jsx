// ============================================================================
// AddDeviceModal.jsx  --  "how a device joins" info dialog
// ----------------------------------------------------------------------------
// There is no manual "create device" form, because devices ADD THEMSELVES: a
// real node (or the simulator) connects to the broker and publishes a retained
// `meta` message, and the backend creates the registry row on first sight. So
// rather than fake a form, this modal honestly explains that onboarding flow --
// which doubles as useful documentation for the intern.
// ============================================================================

import React from 'react';

export default function AddDeviceModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Adding a device</h2>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="muted">
          Devices aren't created from the dashboard — they <strong>register
          themselves</strong>. When a node connects to the MQTT broker it
          publishes a retained <code>meta</code> message, and the backend creates
          its registry row the first time it's seen.
        </p>

        <p className="muted">A device announces itself like this:</p>
        <pre className="code-block">{`topic:   devices/<id>/meta   (retained)
payload: {
  "name": "Line 5 Controller",
  "location": "Plant C",
  "type": "NGI-3000",
  "firmware": "1.0.0"
}`}</pre>

        <p className="muted">
          The <code>type</code> must match a row in the <code>device_types</code>
          table (that's what tells the dashboard which metrics and controls to
          show). To add a brand-new kind of device, insert one row there — no app
          code changes needed.
        </p>

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

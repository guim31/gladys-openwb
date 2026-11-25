// -----------------------------------------------------------------------------
// Scene events, derived from the successive states of the chargepoints
// (openWB publishes states, not events):
//
// - vehicle_connected / vehicle_disconnected: `get/plug_state`;
// - charging_started / charging_finished: a charge, not every pause. In PV
//   mode openWB stops and resumes the charge with the clouds; a charge is
//   "finished" once it stayed stopped for QUIET_MS, or right away when the
//   vehicle is unplugged. A charge resumed after that is a new charge.
//
// Nothing fires from the first look after a (re)connection to the broker: it
// only sets the baseline, so a restart never replays what already happened.
// -----------------------------------------------------------------------------

export const QUIET_MS = 10 * 60_000;

export const TRIGGERS = {
  connected: 'vehicle_connected',
  disconnected: 'vehicle_disconnected',
  started: 'charging_started',
  finished: 'charging_finished',
};

export class SessionTracker {
  constructor({ quietMs = QUIET_MS } = {}) {
    this.quietMs = quietMs;
    // chargepoint id -> { baseline, plugged, charging, inCharge, stoppedAt, vehicle, energy, soc }
    this.chargepoints = new Map();
  }

  /** Forget the baselines (connection lost): the next look sets them again. */
  reset() {
    for (const tracked of this.chargepoints.values()) {
      tracked.baseline = false;
    }
  }

  /**
   * Compare the chargepoints with their previous look. `views` are
   * `{ id, plugged, charging, vehicle, energy, soc, mode }` (energy in Wh).
   * Returns the events, in order: `{ type, view }`.
   */
  update(views, now) {
    const events = [];
    for (const view of views) {
      if (view.plugged === null || view.charging === null) {
        continue; // not received yet
      }
      let tracked = this.chargepoints.get(view.id);
      if (!tracked || !tracked.baseline) {
        // A charge already running when we (re)connect is followed to its end.
        const inCharge = view.charging || Boolean(tracked?.inCharge && view.plugged);
        this.chargepoints.set(view.id, {
          baseline: true,
          plugged: view.plugged,
          charging: view.charging,
          inCharge,
          stoppedAt: inCharge && !view.charging ? (tracked?.stoppedAt ?? now) : null,
          last: view,
        });
        continue;
      }

      if (view.plugged && !tracked.plugged) {
        events.push({ type: 'connected', view });
      }
      if (view.charging) {
        if (!tracked.inCharge) {
          events.push({ type: 'started', view });
          tracked.inCharge = true;
        }
        tracked.stoppedAt = null;
      } else if (tracked.charging) {
        tracked.stoppedAt = now;
      }
      if (!view.plugged && tracked.plugged) {
        // openWB clears the vehicle and the session log on unplug: the
        // values of the last look where the vehicle was still there.
        const session = withSession(view, tracked.last);
        if (tracked.inCharge) {
          events.push({ type: 'finished', view: session });
          tracked.inCharge = false;
          tracked.stoppedAt = null;
        }
        events.push({ type: 'disconnected', view: session });
      }
      tracked.plugged = view.plugged;
      tracked.charging = view.charging;
      if (view.plugged) {
        tracked.last = view;
      }
      events.push(...this.#quietEnd(tracked, view, now));
    }
    return events;
  }

  /** Called by a timer too: a charge stopped long enough is finished. */
  tick(views, now) {
    const events = [];
    for (const view of views) {
      const tracked = this.chargepoints.get(view.id);
      if (tracked?.baseline) {
        events.push(...this.#quietEnd(tracked, view, now));
      }
    }
    return events;
  }

  #quietEnd(tracked, view, now) {
    if (tracked.inCharge && tracked.stoppedAt !== null && now - tracked.stoppedAt >= this.quietMs) {
      tracked.inCharge = false;
      tracked.stoppedAt = null;
      return [{ type: 'finished', view }];
    }
    return [];
  }
}

function withSession(view, before) {
  if (!before) {
    return view;
  }
  return {
    ...view,
    vehicle: before.vehicle || view.vehicle,
    energy: view.energy || before.energy,
    soc: view.soc ?? before.soc,
  };
}

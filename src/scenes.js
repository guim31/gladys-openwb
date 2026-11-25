// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// A refused command (unknown chargepoint, control off, value out of range,
// openWB not confirming) throws an ActionFailure: the action fails, the scene
// goes on and Gladys shows the message.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async set_mode(hub, { fields }) {
    await hub.setMode(fields.device, fields.mode);
  },

  async set_current(hub, { fields }) {
    await hub.setCurrent(fields.device, fields.current);
  },
};

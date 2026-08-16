(() => {
  "use strict";
  // Hosted deployments or release builds replace these public transport
  // settings. No credential, owner capability, or invite code belongs here.
  if (typeof globalThis.PHYSICS_STUDIO_CLASSROOM_URL !== "string") {
    globalThis.PHYSICS_STUDIO_CLASSROOM_URL = "";
  }
  if (globalThis.PHYSICS_STUDIO_ALLOW_INSECURE_LAN !== true) {
    globalThis.PHYSICS_STUDIO_ALLOW_INSECURE_LAN = false;
  }
})();

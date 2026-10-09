import { isAbsolute } from "node:path";
import { Engine, Store, insist, type Session, type Publication } from "../src/index.ts";
const [command, database, sessionId, confirmation] = Bun.argv.slice(2);
insist(database && isAbsolute(database) && await Bun.file(database).exists(), "USAGE", "bun run admin status|retry|forget <absolute-database> [session-id --confirm]");
const store = new Store(database), engine = new Engine(store);
try {
  if (command === "status") {
    console.log(JSON.stringify({ sessions: store.all<Session>("sessions"), publications: store.all<Publication>("publications").map(({ sourceCover, ...p }) => p), jobs: store.db.query("SELECT status,count(*) AS count FROM jobs GROUP BY status").all() }, null, 2));
  } else if (command === "retry") {
    // Only schedule retry. A plugin with the configured real model must execute the jobs.
    engine.retryFailed(); console.log("Failed jobs are pending. The configured plugin will process them at its next request.");
  } else if (command === "forget") {
    insist(sessionId && confirmation === "--confirm", "CONFIRMATION_REQUIRED", "Stop the OpenCode service first. Supply session-id --confirm to retire its memory; the host transcript is not deleted.");
    store.transaction(() => {
      const s = store.get<Session>("sessions", sessionId); insist(s, "UNKNOWN_SESSION", sessionId);
      if (s.disabled) { delete s.disabled; store.set("sessions", sessionId, s); }
      engine.retire(sessionId, "delete"); store.remove("adapter", sessionId);
    });
    console.log("Memory retired. Reopening a root session imports its available original transcript. Forks/children remain unsupported.");
  } else insist(false, "USAGE", "Use status, retry, or forget");
} finally { store.close(); }

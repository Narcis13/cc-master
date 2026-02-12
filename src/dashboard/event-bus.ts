// Cross-module event bus — avoids circular deps between state.ts and db.ts/triggers.ts.
// Modules that can't import getDashboardState() (due to circular imports) emit
// events here; state.ts subscribes and re-broadcasts them as SSE StateEvents.

import { EventEmitter } from "events";

const orchestratorBus = new EventEmitter();
export default orchestratorBus;

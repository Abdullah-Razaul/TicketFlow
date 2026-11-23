import { app } from './app.js';
import { env } from './config/env.js';
import { releaseExpiredHolds } from './services/expiryWorker.js';

app.listen(env.PORT, () => console.log(`TicketFlow API running on http://localhost:${env.PORT}`));
// A lightweight worker releases expired holds every 15 seconds.
setInterval(() => releaseExpiredHolds().catch(err => console.error('Hold expiry worker failed:', err)), 15_000);

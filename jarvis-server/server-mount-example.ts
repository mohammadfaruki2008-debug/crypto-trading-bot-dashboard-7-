/**
 * EXAMPLE: How to mount Jarvis routes in your existing server.ts.
 * Add these 2 lines to your existing Express server file.
 */

// ─── In your existing server.ts, add: ────────────────────────────
// import { jarvisRouter } from './routes/jarvisRoutes';
// app.use('/api', jarvisRouter);

// That's it! Now your server exposes:
//   POST /api/jarvis          → chat with Jarvis
//   POST /api/jarvis/approve  → approve/reject pending code fix
//   GET  /api/jarvis/status   → monitor/alerts/pending status

// Full example:
import express from 'express';
import cors from 'cors';
import { jarvisRouter } from './src/routes/jarvisRoutes';

const app = express();
app.use(cors());
app.use(express.json());

// ... your existing routes ...

// Mount Jarvis
app.use('/api', jarvisRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server + JARVIS on :${PORT}`));

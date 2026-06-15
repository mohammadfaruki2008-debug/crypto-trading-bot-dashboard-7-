import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// ─── API Routes ──────────────────────────────────────────
// JARVIS API (static import; ensure the file exists at src/routes/jarvisRoutes.ts)
import { jarvisRouter } from './src/routes/jarvisRoutes.js';
app.use('/api', jarvisRouter);

// Health check (useful for Render)
app.get('/api/health', (_req, res) => res.json({ status: 'healthy' }));

// ─── Production Static Serving ──────────────────────────
// Serve the React frontend built by Vite
const frontendPath = path.join(__dirname, 'dist');
app.use(express.static(frontendPath));

// Catch-all to serve index.html for React Router (exclude /api routes)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Quantum Mind Server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   JARVIS: http://localhost:${PORT}/api/jarvis`);
});
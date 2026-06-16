import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import dashboardRoutes from './routes/dashboardRoutes';
import jarvisRoutes from './routes/jarvisRoutes';
import settingsRoutes from './routes/settingsRoutes';
import { startMonitor } from './lib/tools/monitor';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'online' }));

app.use('/api', dashboardRoutes);
app.use('/api', jarvisRoutes);
app.use('/api', settingsRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Quantum Mind Backend running on port ${PORT}`);
  startMonitor(); // Start 24/7 bot on boot
});

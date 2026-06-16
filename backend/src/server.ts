/**
 * Quantum Mind Backend — Express server entry (Monolithic Architecture).
 * Serves both the React Frontend UI and handles API/Trading logic under one roof.
 */
import express from 'express';
import cors from 'cors';
import path from 'path'; // 👈 ফ্রন্টএন্ড ফাইল ট্র্যাক করার জন্য নতুন যোগ করা হয়েছে
import { config, printBanner } from './config';
import { jarvisRouter } from './routes/jarvisRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { settingsRouter } from './routes/settingsRoutes';
import { startMonitor } from './lib/tools/monitor';
// Import jarvisBrain to wire the monitor → JARVIS callback
import './lib/jarvisBrain';

const app = express();

// CORS — মনোলিথ হওয়ার কারণে এটি এখন আর বাধা দেবে না, তাও ব্যাকআপ রাখা হলো
app.use(cors({
  origin: config.frontendUrl === '*' ? true : config.frontendUrl,
  credentials: true,
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  if (req.method !== 'GET') console.log(`[${req.method}] ${req.path}`);
  next();
});

// 📁 ১. ফ্রন্টএন্ডের স্ট্যাটিক ফাইলগুলো এক্সপ্রেসের সাথে কানেক্ট করা
app.use(express.static(path.join(__dirname, '../../dist')));

// 🔌 ২. আপনার এপিআই রাউটগুলো মাউন্ট করা
app.use('/api', settingsRouter);
app.use('/api', dashboardRouter);
app.use('/api/jarvis', jarvisRouter); // জারভিসের রাউট সিকিউর করা হলো

// 🩺 ৩. হেলথ চেক রাউট (আপটিমরোবটের জন্য এটি সচল রাখা হলো)
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));

// 🚀 ৪. ক্যাচ-অল রাউট (কেউ লিংকে ঢুকলে বা পেজ রিফ্রেশ করলে সরাসরি ফ্রন্টএন্ডের UI ওপেন হবে)
app.get('*', (req, res, next) => {
  // যদি কোনো রিকোয়েস্ট /api দিয়ে শুরু হয় এবং তা উপরে না মেলে, তবে সেটি ৪MD৪ এররে যাবে
  if (req.path.startsWith('/api')) {
    return next();
  }
  // বাকি সব ক্ষেত্রে ফ্রন্টএন্ডের সিঙ্গেল ইনডেক্স ফাইলটি ব্রাউজারে পুশ হবে
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

// ❌ ৫. ৪MD৪ এবং গ্লোবাল এরর হ্যান্ডেলার (শুধুমাত্র ভুল এপিআই কলের জন্য)
app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

// ⚡ ৬. সার্ভার লিসেনিং এবং অটো-মনিটর স্টার্ট
const server = app.listen(config.port, () => {
  printBanner();
  console.log(`✅ Single Monolith Engine Listening on port ${config.port}`);

  // 🔑 ২৪/৭ মনিটর অটো-স্টার্ট লজিক
  if (config.monitor.autoStart) {
    console.log('🤖 Auto-starting 24/7 JARVIS monitor in 2s...');
    setTimeout(() => {
      try {
        startMonitor(config.monitor.symbols);
      } catch (err: any) {
        console.error('[BOOT] monitor auto-start failed:', err.message);
      }
    }, 2000);
  } else {
    console.log('⚪ MONITOR_AUTOSTART is false. Use POST /api/monitor-start to start.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => { console.log('[SHUTDOWN] SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('[SHUTDOWN] SIGINT'); server.close(() => process.exit(0)); });
process.on('uncaughtException', (err) => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err));

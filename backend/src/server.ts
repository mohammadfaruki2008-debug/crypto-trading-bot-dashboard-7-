/**
 * Quantum Mind Backend — Express server entry (Monolithic Architecture).
 * Serves both the React Frontend UI and handles API/Trading logic under one roof.
 */
import express from 'express';
import cors from 'cors';
import path from 'path'; 
import dotenv from 'dotenv';

// 🛠️ কারেক্ট ইম্পোর্টস (Default Exports এর জন্য কার্লি ব্রেসেস {} ছাড়া করা হয়েছে)
import config, { printBanner } from './config'; 
import dashboardRouter from './routes/dashboardRoutes';
import jarvisRouter from './routes/jarvisRoutes';
import settingsRouter from './routes/settingsRoutes';
import { startMonitor } from './lib/tools/monitor';

dotenv.config();

const app = express();
const PORT = config.port || process.env.PORT || 8080;

// 🔒 CORS — মনোলিথ হওয়ার কারণে এটি বাধা দেবে না, তাও সিকিউরিটির জন্য রাখা হলো
app.use(cors({
  origin: config.frontendUrl === '*' ? true : config.frontendUrl,
  credentials: true,
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '5mb' }));

// 📝 সিম্পল রিকোয়েস্ট লগার
app.use((req, _res, next) => {
  if (req.method !== 'GET') console.log(`[${req.method}] ${req.path}`);
  next();
});

// 📁 ১. ফ্রন্টএন্ডের স্ট্যাটিক ফাইলগুলো এক্সপ্রেসের সাথে কানেক্ট করা
app.use(express.static(path.join(__dirname, '../../dist')));

// 🔌 ২. আপনার এপিআই রাউটগুলো মাউন্ট করা
app.use('/api', settingsRouter);
app.use('/api', dashboardRouter);
app.use('/api', jarvisRouter); // সরাসরি /api/jarvis-ask বা নির্ধারিত রাউটে নক করবে

// 🩺 ৩. হেলথ চেক রাউট (আপটিমরোবটের জন্য এটি সচল রাখা হলো)
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));

// 🚀 ৪. ক্যাচ-অল রাউট (কেউ ড্যাশবোর্ডে রিফ্রেশ করলে যেন ৪MD৪ না খেয়ে সরাসরি UI ওপেন হয়)
app.get('*', (req, res, next) => {
  // যদি কোনো রিকোয়েস্ট /api দিয়ে শুরু হয় এবং তা উপরে না মেলে, তবে সেটি সরাসরি এরর হ্যান্ডলারে যাবে
  if (req.path.startsWith('/api')) {
    return next();
  }
  // বাকি সব ক্ষেত্রে ফ্রন্টএন্ডের সিঙ্গেল ইনডেক্স ফাইলটি ব্রাউজারে পুশ হবে
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

// ❌ ৫. ৪MD৪ এবং গ্লোবাল এরর হ্যান্ডেলার
app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ⚡ ৬. একক মনোলিথ ইঞ্জিন লিসেনিং এবং অটো-মনিটর স্টার্ট
const server = app.listen(PORT, () => {
  try {
    printBanner();
  } catch (e) {
    console.log(`🚀 Quantum Mind Monolith Engine Active`);
  }
  console.log(`✅ Monolith server successfully listening on port ${PORT}`);

  // 🔑 ২৪/৭ ক্রিপ্টো মনিটর অটো-স্টার্ট লজিক (TS2554 এরর এড়াতে আর্গুমেন্ট ছাড়া কল করা হয়েছে)
  console.log('🤖 Starting background JARVIS trading monitor...');
  try {
    startMonitor();
  } catch (err: any) {
    console.error('[BOOT] Monitor auto-start failed:', err.message);
  }
});

// 🛑 Graceful Shutdown হ্যান্ডেলিং
process.on('SIGTERM', () => { console.log('[SHUTDOWN] SIGTERM received.'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('[SHUTDOWN] SIGINT received.'); server.close(() => process.exit(0)); });
process.on('uncaughtException', (err) => console.error('[CRITICAL UNCAUGHT]', err));
process.on('unhandledRejection', (err) => console.error('[CRITICAL UNHANDLED]', err));
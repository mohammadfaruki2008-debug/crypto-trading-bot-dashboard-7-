import { Router } from 'express';
import { askJarvis } from '../lib/jarvisBrain';

const router = Router();

// 🚀 ফ্রন্টএন্ড যে নামেই ডাকুক না কেন (POST /api/jarvis অথবা /api/jarvis-ask) ব্যাকএন্ড রেসপন্স করবে
const handleJarvisChat = async (req: any, res: any) => {
  try {
    const { message, userMessage } = req.body;
    // ফ্রন্টএন্ড থেকে বডি-তে 'message' বা 'userMessage' যেকোনো একটা আসলেই রিড করবে
    const prompt = message || userMessage;

    if (!prompt) {
      return res.status(400).json({ error: 'Message is required, sir.' });
    }

    console.log(`💬 [JARVIS ROUTE] User asked: "${prompt}"`);
    
    // ডিরেক্ট ব্রেইন ফাংশন কল
    const reply = await askJarvis(prompt);
    
    // ফ্রন্টএন্ড যেন 'text' বা 'reply' যেকোনো ফরম্যাটেই ডাটা পাক, দুটাই পাঠানো হলো
    return res.json({ text: reply, reply: reply });
  } catch (error: any) {
    console.error('[JARVIS ROUTE ERROR]:', error.message);
    return res.status(500).json({ error: 'Internal server error in Jarvis network.' });
  }
};

router.post('/jarvis', handleJarvisChat);
router.post('/jarvis-ask', handleJarvisChat);
router.post('/', handleJarvisChat);

export default router;
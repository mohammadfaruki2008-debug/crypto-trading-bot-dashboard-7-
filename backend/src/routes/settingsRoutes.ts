import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { saveEncryptedCreds } from '../lib/settingsStore';

const router = Router();

router.post('/settings/save', requireAuth, async (req, res) => {
  try {
    const { apiKey, secretKey, testnet } = req.body;
    if (!apiKey || !secretKey) return res.status(400).json({ error: 'Keys are required' });
    
    await saveEncryptedCreds(apiKey, secretKey, !!testnet);
    res.json({ success: true, message: 'Encrypted and saved permanently.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

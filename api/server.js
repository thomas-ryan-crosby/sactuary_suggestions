const express = require('express');
const db = require('../lib/database');

const app = express();
const ADMIN_KEY = process.env.ADMIN_KEY || 'sanctuary-board-2026';

app.use(express.json());

// --- Admin Auth Middleware ---
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Public Routes ---

// Submit a suggestion
app.post('/api/suggestions', async (req, res) => {
  try {
    const { name, address, email, phone, suggestion, is_private } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!address || !address.trim()) return res.status(400).json({ error: 'Address is required' });
    if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });
    if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });
    if (!suggestion || !suggestion.trim()) return res.status(400).json({ error: 'Suggestion is required' });

    const created = await db.createSuggestion({
      name: name.trim(),
      address: address.trim(),
      email: (email || '').trim(),
      phone: (phone || '').trim(),
      suggestion: suggestion.trim(),
      is_private: !!is_private,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all suggestions for residents (private ones are anonymized)
app.get('/api/suggestions', async (req, res) => {
  try {
    res.json(await db.getResidentSuggestions());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Promote a suggestion
app.post('/api/suggestions/:id/promote', async (req, res) => {
  try {
    const { voter_uid } = req.body;
    if (!voter_uid) return res.status(400).json({ error: 'voter_uid is required' });

    const item = await db.getSuggestionById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Suggestion not found' });

    const result = await db.promoteSuggestion(req.params.id, voter_uid);
    if (!result.success) {
      return res.status(409).json({ error: 'You have already promoted this item' });
    }

    res.json({ promotions: result.promotions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Admin Routes ---

// Get all suggestions (including private)
app.get('/api/admin/suggestions', requireAdmin, async (req, res) => {
  try {
    res.json(await db.getAllSuggestions());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Respond to a suggestion
app.put('/api/admin/suggestions/:id/respond', requireAdmin, async (req, res) => {
  try {
    const { response } = req.body;
    if (response === undefined) return res.status(400).json({ error: 'Response text is required' });

    const item = await db.getSuggestionById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Suggestion not found' });

    const updated = await db.respondToSuggestion(req.params.id, response.trim());
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a suggestion
app.delete('/api/admin/suggestions/:id', requireAdmin, async (req, res) => {
  try {
    const item = await db.getSuggestionById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Suggestion not found' });

    await db.deleteSuggestion(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;

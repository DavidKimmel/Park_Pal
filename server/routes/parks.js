const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../db');
require('dotenv').config();

const NPS_API_KEY = process.env.NPS_API_KEY;
const BASE_URL = 'https://developer.nps.gov/api/v1/parks';

// ------------------ PARK LIST ------------------
router.get('/', async (req, res) => {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        limit: 50,
        api_key: NPS_API_KEY
      }
    });

    const parks = response.data.data;
    res.json(parks);
  } catch (error) {
    console.error('Error fetching parks:', error.message);
    res.status(500).json({ error: 'Failed to fetch parks' });
  }
});

// GET /api/parks/extra/:code
router.get('/extra/:code', async (req, res) => {
  const parkCode = req.params.code;
  const endpoints = ['activities', 'alerts', 'events', 'feespasses', 'visitorcenters', 'thingstodo', 'multimedia/videos'];

  try {
    const results = await Promise.all(
      endpoints.map(endpoint =>
        axios.get(`https://developer.nps.gov/api/v1/${endpoint}`, {
          params: {
            parkCode,
            api_key: NPS_API_KEY
          }
        }).then(r => ({ [endpoint]: r.data }))
          .catch(e => {
            console.warn(`Failed to fetch ${endpoint} for ${parkCode}: ${e.message}`);
            return { [endpoint]: null };
          })
      )
    );

    const merged = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    res.json(merged);
  } catch (err) {
    console.error('Error in /extra/:code route:', err.message);
    res.status(500).json({ error: 'Failed to fetch extra park data' });
  }
});


// ------------------ TRIP ROUTES ------------------

// POST create trip
router.post('/trips', async (req, res) => {
  const { trip_name, start_date, end_date } = req.body;
  console.log('Received trip:', { trip_name, start_date, end_date });

  try {
    const result = await db.query(
      'INSERT INTO trips (trip_name, start_date, end_date) VALUES ($1, $2, $3) RETURNING *',
      [trip_name, start_date, end_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error saving trip:', err);
    res.status(500).json({ error: 'Failed to save trip' });
  }
});

// GET all trips
router.get('/trips', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM trips ORDER BY start_date');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trips:', err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// DELETE a trip and its items
router.delete('/trips/:id', async (req, res) => {
  try {
    const r = await db.query('DELETE FROM trips WHERE trip_id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Trip not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting trip:', err);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// ------------------ ITINERARY ROUTES ------------------

// GET all itinerary items for a trip
router.get('/trips/:id/items', async (req, res) => {
  try {
    const q = `
      SELECT * FROM itinerary_items
      WHERE trip_id = $1
      ORDER BY item_date, start_time NULLS LAST, sort_order, item_id
    `;
    const r = await db.query(q, [req.params.id]);
    res.json(r.rows);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST create new itinerary item
router.post('/trips/:id/items', async (req, res) => {
  const { park_code, item_date, start_time, end_time, title, notes, sort_order } = req.body;
  if (!item_date || !title) return res.status(400).json({ error: 'item_date and title are required' });

  try {
    const q = `
      INSERT INTO itinerary_items
        (trip_id, park_code, item_date, start_time, end_time, title, notes, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `;
    const r = await db.query(q, [
      req.params.id,
      park_code || null,
      item_date,
      start_time || null,
      end_time || null,
      title,
      notes || null,
      sort_order ?? 0
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update itinerary item
router.put('/trips/:id/items/:itemId', async (req, res) => {
  const { park_code, item_date, start_time, end_time, title, notes, sort_order } = req.body;

  try {
    const q = `
      UPDATE itinerary_items
      SET park_code=$1, item_date=$2, start_time=$3, end_time=$4, title=$5, notes=$6, sort_order=$7
      WHERE trip_id=$8 AND item_id=$9
      RETURNING *
    `;
    const r = await db.query(q, [
      park_code || null,
      item_date,
      start_time || null,
      end_time || null,
      title,
      notes || null,
      sort_order ?? 0,
      req.params.id,
      req.params.itemId
    ]);
    if (!r.rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE itinerary item
router.delete('/trips/:id/items/:itemId', async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM itinerary_items WHERE trip_id=$1 AND item_id=$2`,
      [req.params.id, req.params.itemId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;

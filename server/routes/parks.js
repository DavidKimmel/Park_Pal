const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../db');
require('dotenv').config();

const NPS_API_KEY = process.env.NPS_API_KEY;
const BASE_URL = 'https://developer.nps.gov/api/v1/parks';

// GET /api/parks
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
    console.error('Error saving trip:', err);  // full error for diagnosis
    res.status(500).json({ error: 'Failed to save trip' });
  }
});

module.exports = router;
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  ssl: {
    rejectUnauthorized: false // needed for AWS RDS
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

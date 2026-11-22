const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function prepareEmptyProductionDatabase() {
  if (process.env.NODE_ENV !== 'production') return;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined,
    multipleStatements: true
  });
  try {
    const [tables] = await connection.query('SHOW TABLES');
    if (tables.length) return;
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'render-demo.sql'), 'utf8');
    await connection.query(schema);
    console.log('Initialized the empty hosted database with demo schema and sample data.');
  } finally {
    await connection.end();
  }
}

prepareEmptyProductionDatabase()
  .then(() => require('../server'))
  .catch(error => {
    console.error('Production database setup failed:', error);
    process.exit(1);
  });

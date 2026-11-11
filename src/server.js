const config = require('./config');
const db = require('./db/database');

// First run: the database is empty -> fill it with the demo organisation.
if (db.get('SELECT COUNT(*) AS n FROM users').n === 0) {
  console.log('Empty database detected, seeding demo data...');
  require('./db/seed').seed().then(start);
} else {
  start();
}

function start() {
  const app = require('./app');
  app.listen(config.port, () => {
    console.log(`IAM Gateway running on http://localhost:${config.port}`);
  });
}

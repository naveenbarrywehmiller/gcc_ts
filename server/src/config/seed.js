// Setup never inserts sample users, organization records, tasks or holidays.
// Keep the legacy command as an idempotent entry point for existing deployments.
const { migrate } = require('./migrate');

function seed() {
  migrate();
  console.log('Clean setup complete. No sample data was added.');
}

if (require.main === module) seed();
module.exports = seed;

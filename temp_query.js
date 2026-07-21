const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'prima_gym_db',
  password: '',
  port: 5432
});
client.connect().then(() => {
  return client.query("DELETE FROM memberships;");
}).then(res => {
  console.log("Deleted all memberships:", res.rowCount);
  client.end();
}).catch(console.error);

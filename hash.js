const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('owner123', 10);
console.log(hash);

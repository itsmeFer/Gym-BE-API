const { User } = require('./database/models');
async function checkOwner() {
  try {
    const owner = await User.findOne({ where: { role: 'owner' } });
    if (owner) {
      console.log('AKUN_OWNER_DITEMUKAN');
      console.log('Email: ' + owner.email);
      console.log('Name: ' + owner.name);
      console.log('ID: ' + owner.id);
    } else {
      console.log('AKUN_OWNER_TIDAK_DITEMUKAN');
    }
  } catch (error) {
    console.error(error);
  }
  process.exit();
}
checkOwner();

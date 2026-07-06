const crypto = require('crypto');

// Excludes visually-ambiguous characters (0/O, 1/I/L) so codes are easy to
// read and say aloud over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

function generateOrderNumber() {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

module.exports = { generateOrderNumber };

/* eslint-disable no-console */
import 'dotenv/config';

function checkMissing(vars) {
  const missing = vars.reduce((arr, key) => {
    if (!process.env[key]) {
      arr.push(key);
    }
    return arr;
  }, []);

  if (missing.length) {
    console.log(`The following environment variables are not defined:`);
    for (const item of missing) {
      console.log(' - ', item);
    }
    process.exit(1);
  }
}

function checkAppSecret() {
  const value = process.env.APP_SECRET?.trim();
  const placeholder = 'replace-with-a-long-random-value';

  if (!value || value === placeholder || Buffer.byteLength(value, 'utf8') < 32) {
    console.log(
      'APP_SECRET must be a random value of at least 32 bytes (for example: openssl rand -hex 32).',
    );
    process.exit(1);
  }
}

if (!process.env.SKIP_DB_CHECK) {
  checkMissing(['DATABASE_URL']);
}

checkAppSecret();

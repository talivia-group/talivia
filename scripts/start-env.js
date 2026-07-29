import 'dotenv/config';
import cli from 'next/dist/cli/next-start';

cli.nextStart({
  port: 3000,
  hostname: process.env.HOSTNAME || '0.0.0.0',
});

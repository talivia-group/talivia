declare module '*.css';
declare module '*.svg';
declare module '*.json';
declare module 'bcryptjs';
declare module 'chartjs-adapter-date-fns';
declare module 'cors';
declare module 'date-fns-tz';
declare module 'debug';
declare module 'jsonwebtoken';
declare module 'md5';
declare module 'papaparse';
declare module 'prettier';
declare module 'react-simple-maps';
declare module 'semver';
declare module 'tsup';
declare module 'uuid';
interface BigInt {
  toJSON(): number;
}

interface Window {
  talivia: {
    track: (...args: any[]) => Promise<string>;
    identify: (...args: any[]) => Promise<string>;
    getSessionId?: () => string;
  };
}

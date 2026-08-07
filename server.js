process.env.NODE_ENV ||= 'production';

import('./server.bundle.js').catch((error) => {
  console.error('Failed to start the server:', error);
  process.exitCode = 1;
});

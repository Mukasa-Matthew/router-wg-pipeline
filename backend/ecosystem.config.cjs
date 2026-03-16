module.exports = {
  apps: [{
    name: 'routerhub-backend',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
    },
    env_production: {
      NODE_ENV: 'production',
    },
  }],
};

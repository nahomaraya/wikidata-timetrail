export default () => ({
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'changeme',
    jwtExpiration: process.env.JWT_EXPIRATION || '3600s',
  },
});

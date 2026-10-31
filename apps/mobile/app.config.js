// EAS cloud builds receive google-services.json as a file secret (GOOGLE_SERVICES_JSON) because the repo is public.
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json' },
});

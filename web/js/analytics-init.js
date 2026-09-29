import { inject } from './vendor/vercel-analytics.js';

// The static app has no bundler. The build copies the official browser module
// into web/ so the same package version is served on every deployment.
if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  inject({ mode: 'production', debug: false });
}

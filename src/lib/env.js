const toBool = (val, def = false) => {
  if (val === undefined || val === null || val === '') return def;
  const s = String(val).toLowerCase().trim();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return def;
};

const toInt = (val, def) => {
  const n = Number.parseInt(String(val ?? '').trim(), 10);
  return Number.isFinite(n) ? n : def;
};

const toFloat = (val, def) => {
  const n = Number.parseFloat(String(val ?? '').trim());
  return Number.isFinite(n) ? n : def;
};

const get = (key, def = undefined) => {
  const v = process.env[key];
  return v === undefined ? def : v;
};

const must = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
};

export const env = {
  nodeEnv: get('NODE_ENV', 'development'),
  isProd: get('NODE_ENV', 'development') === 'production',
  port: toInt(get('PORT'), 3001),

  // App
  appUrl: get('APP_URL', 'http://localhost:5173'),
  appDomain: get('APP_DOMAIN', 'localhost'),

  // Auth / JWT
  jwtSecret: get('JWT_SECRET', ''),
  cookieName: get('COOKIE_NAME', 'nova_auth'),
  refreshCookieName: get('REFRESH_COOKIE_NAME', 'ne_refresh'),
  cookieSecure: toBool(get('COOKIE_SECURE'), false),
  cookieSameSite: get('COOKIE_SAMESITE', 'Lax'),
  // Token durations
  accessTokenDays: toFloat(get('ACCESS_TOKEN_DAYS'), 1),
  refreshTokenDays: toFloat(get('REFRESH_TOKEN_DAYS'), 30),
  // Deprecated: COOKIE_MAX_AGE_DAYS (use ACCESS_TOKEN_DAYS instead)
  get cookieMaxAgeDays() {
    return toInt(get('COOKIE_MAX_AGE_DAYS')) || this.accessTokenDays
  },

  // Database
  databaseUrl: must('DATABASE_URL'),

  // SMTP
  smtp: {
    host: get('SMTP_HOST', 'smtp.gmail.com'),
    port: toInt(get('SMTP_PORT'), 465),
    secure: toBool(get('SMTP_SECURE'), true),
    user: get('SMTP_USER', ''),
    pass: get('SMTP_PASS', ''),
    from: get('SMTP_FROM', 'Nova English <no-reply@localhost>'),
  },

  // Token expirations (in minutes)
  emailVerificationExpiresMinutes: toInt(get('EMAIL_VERIFICATION_EXPIRES_MINUTES'), 30),
  passwordResetExpiresMinutes: toInt(get('PASSWORD_RESET_EXPIRES_MINUTES'), 30),
  // Deprecated: hours-based settings (kept for backward compatibility)
  get emailVerificationExpiresHours() {
    return toInt(get('EMAIL_VERIFICATION_EXPIRES_HOURS')) || Math.ceil(this.emailVerificationExpiresMinutes / 60)
  },
  get passwordResetExpiresHours() {
    return toInt(get('PASSWORD_RESET_EXPIRES_HOURS')) || Math.ceil(this.passwordResetExpiresMinutes / 60)
  },

  // Rate limiting
  rateLimit: {
    loginWindowMs: toInt(get('RATE_LIMIT_LOGIN_WINDOW_MS'), 60_000),
    loginMax: toInt(get('RATE_LIMIT_LOGIN_MAX'), 5),
    forgotWindowMs: toInt(get('RATE_LIMIT_FORGOT_WINDOW_MS'), 60_000),
    forgotMax: toInt(get('RATE_LIMIT_FORGOT_MAX'), 3),
  },

  // CORS (dev only)
  corsOrigin: get('CORS_ORIGIN') || get('ALLOWED_ORIGIN', 'http://localhost:5173'),

  // Media storage
  mediaBaseUrl: get('MEDIA_BASE_URL', ''),
  storageDriver: get('STORAGE_DRIVER', 'local'),
  mediaMaxImageMb: toInt(get('MEDIA_MAX_IMAGE_MB'), 5),
  mediaMaxAudioMb: toInt(get('MEDIA_MAX_AUDIO_MB'), 15),
  mediaAllowedImageTypes: get('MEDIA_ALLOWED_IMAGE_TYPES', 'image/jpeg,image/png,image/webp,image/gif'),
  mediaAllowedAudioTypes: get('MEDIA_ALLOWED_AUDIO_TYPES', 'audio/mpeg,audio/wav,audio/ogg'),

  r2Endpoint: get('R2_ENDPOINT', ''),
  r2Bucket: get('R2_BUCKET_NAME', ''),
  r2AccessKeyId: get('R2_ACCESS_KEY_ID', ''),
  r2SecretAccessKey: get('R2_SECRET_ACCESS_KEY', ''),
  r2PublicBaseUrl: get('R2_PUBLIC_BASE_URL', ''),

  // Automated cleanup
  cronSecret: get('CRON_SECRET', ''),
  // User cleanup
  unverifiedUserCleanupDays: toInt(get('UNVERIFIED_USER_CLEANUP_DAYS'), 30),
  // Fallback for old env var name (deprecated)
  get unverifiedRetentionDays() { 
    return toInt(get('UNVERIFIED_RETENTION_DAYS')) || this.unverifiedUserCleanupDays 
  },
  // Token cleanup
  refreshTokenCleanupDays: toInt(get('REFRESH_TOKEN_CLEANUP_DAYS'), 7),
  // Fallback for old env var name (deprecated)
  get refreshRevokedRetentionDays() {
    return toInt(get('REFRESH_REVOKED_RETENTION_DAYS')) || this.refreshTokenCleanupDays
  },
  // Test data cleanup
  testDataCleanupDays: toInt(get('TEST_DATA_CLEANUP_DAYS'), 1),
  // Fallback for old env var name (deprecated)
  get cleanupRetentionDays() {
    return toInt(get('CLEANUP_RETENTION_DAYS')) || this.testDataCleanupDays
  },
  // Historical test result cleanup (TestRecord + TestAttempt)
  // Retention in months, used by /api/cron/cleanup-results
  testResultRetentionMonths: toInt(get('TEST_RESULT_RETENTION_MONTHS'), 12),
};

export const envHelpers = {
  toBool,
  toInt,
  get,
  must,
  // Derived helpers
  getVerificationTtlMs() {
    return env.emailVerificationExpiresMinutes * 60 * 1000
  },
  getPasswordResetTtlMs() {
    return env.passwordResetExpiresMinutes * 60 * 1000
  },
  getRefreshTtlMs() {
    return (env.refreshTokenDays ?? 30) * 24 * 60 * 60 * 1000
  },
  getRevokedPruneCutoffDate() {
    const days = env.refreshTokenCleanupDays ?? 7
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }
};

export default env;

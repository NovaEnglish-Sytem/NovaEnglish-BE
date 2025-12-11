# NovaEnglish Backend API

Backend API untuk aplikasi NovaEnglish - Platform testing bahasa Inggris dengan sistem authentication, test management, dan media uploads.

## 📋 Daftar Isi

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)

---

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router - API Routes only)
- **Language:** JavaScript (ES Modules)
- **Database:** PostgreSQL
- **ORM:** Prisma 5
- **Authentication:** JWT + Refresh Token dengan HTTP-only cookies
- **Email:** Nodemailer (SMTP)
- **Validation:** Zod
- **Process Manager:** PM2
- **Password Hashing:** bcryptjs
- **Node Version:** >= 18.18.0

---

## ✨ Features

### Authentication & Authorization
- ✅ User registration dengan email verification
- ✅ Login dengan JWT access token + refresh token
- ✅ Password reset via email
- ✅ Role-based access control (Student, Tutor, Admin)
- ✅ HTTP-only secure cookies
- ✅ Token refresh mechanism
- ✅ Rate limiting untuk auth endpoints

### Test Management
- ✅ Multi-category test system (Listening, Reading, dll)
- ✅ Question packages dengan multiple pages
- ✅ Multiple question types (MCQ, True/False/Not Given, Short Answer)
- ✅ Active test session protection (prevent multiple devices)
- ✅ Auto-submit expired tests
- ✅ Temporary answer storage (hybrid localStorage + DB)
- ✅ Automated scoring & grading
- ✅ Tutor feedback system

### Media Management
- ✅ Image upload (JPEG, PNG, WebP, GIF)
- ✅ Audio upload (MP3, WAV, OGG)
- ✅ File size validation
- ✅ Local storage (dengan option untuk S3)
- ✅ Audio play count tracking (max 2 plays)

### Automated Cleanup
- ✅ Cleanup unverified users (configurable days)
- ✅ Cleanup expired tokens
- ✅ Cleanup temporary test data
- ✅ Cleanup revoked refresh tokens
- ✅ Cron-protected endpoints

---

## 📁 Project Structure

```
next-api/
├── app/                    # Next.js App Router
│   └── api/               # API Routes
│       ├── auth/          # Authentication endpoints
│       ├── student/       # Student endpoints
│       ├── tutor/         # Tutor endpoints
│       ├── admin/         # Admin endpoints
│       ├── test/          # Test management
│       ├── upload/        # Media upload
│       └── cron/          # Cleanup cron jobs
│
├── prisma/                # Database
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Migration history
│   └── seed.js           # Seed data
│
├── src/
│   ├── emails/           # Email templates
│   ├── lib/              # Libraries & utilities
│   ├── middleware/       # Express-like middleware
│   └── utils/            # Helper functions
│
├── uploads/              # Local media storage
│   ├── images/          # Uploaded images
│   └── audio/           # Uploaded audio
│
├── logs/                # PM2 logs
├── .env                 # Environment variables (not in git)
├── .env.example         # Environment template
├── .env.production      # Production template
├── next.config.mjs      # Next.js configuration
├── ecosystem.config.cjs # PM2 configuration
├── deploy.sh           # Deployment script
├── package.json        # Dependencies
└── README.md          # This file
```

---

## 🚀 Development Setup

### Prerequisites

- Node.js >= 18.18.0
- PostgreSQL >= 12
- npm atau yarn
- Git

### 1. Clone Repository

```bash
cd next-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

**Opsi A: Local PostgreSQL**

```bash
# Install PostgreSQL (jika belum)
# Windows: Download dari postgresql.org
# Mac: brew install postgresql
# Linux: sudo apt install postgresql

# Create database
createdb nova_english

# Atau via psql:
psql -U postgres
CREATE DATABASE nova_english;
\q
```

**Opsi B: Cloud PostgreSQL**

Gunakan provider seperti:
- Supabase (free tier available)
- Railway (free tier available)
- Neon (free tier available)
- ElephantSQL (free tier available)

### 4. Configure Environment Variables

```bash
# Copy template
cp .env.example .env

# Edit .env file dengan credentials Anda
nano .env
```

**Minimal configuration untuk development:**

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nova_english?schema=public

# Auth
JWT_SECRET=development-secret-change-in-production
COOKIE_SECURE=false
COOKIE_SAMESITE=Lax

# SMTP (optional untuk development)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password

# Frontend
APP_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Cron (optional)
CRON_SECRET=development-cron-secret
```

### 5. Setup Database Schema

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed initial data (optional)
npm run prisma:seed
```

### 6. Start Development Server

```bash
npm run dev
```

Server akan berjalan di: `http://localhost:3001`

### 7. Verify Installation

```bash
# Health check
curl http://localhost:3001/api/health

# Expected response:
# {"status":"healthy"}
```

---

## 🚢 Production Deployment

Untuk deployment ke production, lihat panduan lengkap di:

- **[QUICK-START.md](./QUICK-START.md)** - Panduan cepat (5 langkah)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Panduan lengkap & detail
- **[PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)** - Checklist deployment

### Quick Deploy ke Dewacloud

```bash
# 1. Setup environment variables
cp .env.production .env
# Edit .env dengan production credentials

# 2. Run deployment script
chmod +x deploy.sh
./deploy.sh

# 3. Setup PM2 auto-start
pm2 startup
pm2 save
```

---

## 📚 API Documentation

### Base URL

- Development: `http://localhost:3001/api`
- Production: `https://your-backend-domain.dewacloud.com/api`

### Authentication

Most endpoints require authentication via HTTP-only cookies (`nova_auth` dan `ne_refresh`).

Include credentials in requests:
```javascript
fetch(url, {
  credentials: 'include'
})
```

### Endpoints Overview

#### Auth
- `POST /api/auth/register` - Register user baru
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/verify-email` - Verify email dengan token
- `POST /api/auth/resend-verification` - Resend verification email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password dengan token
- `POST /api/auth/refresh` - Refresh access token

#### Student
- `GET /api/student/dashboard` - Dashboard data
- `GET /api/student/active-session` - Check active test session
- `GET /api/student/test-record/:recordId` - Get test record details
- `GET /api/student/result/:attemptId` - Get test result

#### Test Management
- `POST /api/test/prepare` - Prepare test session
- `GET /api/test/:attemptId` - Get test data
- `POST /api/test/:attemptId/save-answers` - Save temporary answers
- `POST /api/test/:attemptId/submit` - Submit test

#### Tutor (Protected)
- `GET /api/tutor/categories` - List categories
- `POST /api/tutor/categories` - Create category
- `GET /api/tutor/packages` - List packages
- `POST /api/tutor/packages` - Create package
- `GET /api/tutor/packages/:packageId` - Get package details
- `PUT /api/tutor/packages/:packageId` - Update package
- `DELETE /api/tutor/packages/:packageId` - Delete package

#### Admin (Protected)
- `GET /api/admin/users` - List all users
- `GET /api/admin/stats` - System statistics
- `PUT /api/admin/users/:userId/role` - Update user role

#### Upload
- `POST /api/upload/image` - Upload image
- `POST /api/upload/audio` - Upload audio

#### Cron Jobs (Protected with CRON_SECRET)
- `GET /api/cron/cleanup-answers` - Cleanup old test data
- `POST /api/auth/cleanup-refresh-tokens` - Cleanup revoked tokens
- `POST /api/auth/cleanup-unverified` - Cleanup unverified users
- `POST /api/auth/cleanup-verification-tokens` - Cleanup expired verification tokens
- `POST /api/auth/cleanup-reset-tokens` - Cleanup expired reset tokens
- `POST /api/cron/cleanup-results` - Cleanup historical test records and attempts beyond retention window

### Example Request

**Register User:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "SecurePass123",
    "fullName": "John Doe"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "student@example.com",
    "password": "SecurePass123"
  }'
```

**Get Profile (with auth):**
```bash
curl http://localhost:3001/api/auth/me \
  -b cookies.txt
```

---

## 🔧 Environment Variables

Lihat file `.env.example` untuk daftar lengkap environment variables.

### Required Variables (Production)

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://your-frontend-domain.vercel.app
COOKIE_SECURE=true
COOKIE_SAMESITE=None
```

### Optional Variables

```env
MEDIA_BASE_URL=https://your-backend-domain.com
STORAGE_DRIVER=local
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
CRON_SECRET=your-cron-secret
```

---

## 🗄️ Database Schema

### Main Models

- **User** - User accounts (Student, Tutor, Admin)
- **QuestionCategory** - Test categories (Listening, Reading, dll)
- **QuestionPackage** - Package soal per category
- **QuestionPage** - Halaman dalam package (dengan story/instructions)
- **QuestionItem** - Individual questions
- **MediaAsset** - Images & audio files
- **TestRecord** - Multi-category test session
- **TestAttempt** - Single package attempt
- **ActiveTestSession** - Active test session protection
- **TemporaryAnswer** - Draft answers during test
 

### Relations

```
User
├── TestRecord (1:many)
├── TestAttempt (1:many)
└── ActiveTestSession (1:1)

QuestionCategory
└── QuestionPackage (1:many)

QuestionPackage
├── QuestionPage (1:many)
└── TestAttempt (1:many)

QuestionPage
├── QuestionItem (1:many)
└── MediaAsset (1:many)

TestRecord
├── TestAttempt (1:many)
└── ActiveTestSession (1:many)

TestAttempt
├── ActiveTestSession (1:1)
└── TemporaryAnswer (1:many)
```

### View Schema

```bash
# Open Prisma Studio
npm run prisma:studio

# Or view schema file
cat prisma/schema.prisma
```

---

## 📜 Scripts

### Development

```bash
npm run dev              # Start dev server (port 3001)
npm run build           # Build production
npm run start           # Start production server
```

### Database

```bash
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run migrations (dev)
npm run prisma:deploy    # Run migrations (production)
npm run prisma:studio    # Open Prisma Studio
npm run prisma:seed      # Seed database
```

### Deployment

```bash
npm run deploy          # Full deployment (migrate + build)
./deploy.sh            # Deploy script (with PM2)
./deploy.sh --no-build # Deploy without build
./deploy.sh --fresh    # Fresh install
```

### PM2 Management

```bash
pm2 start ecosystem.config.cjs  # Start app
pm2 restart novaenglish-api     # Restart app
pm2 stop novaenglish-api        # Stop app
pm2 logs novaenglish-api        # View logs
pm2 monit                       # Monitor resources
pm2 status                      # Check status
```

---

## 🐛 Troubleshooting

### Database Connection Failed

```bash
# Test connection manually
psql -h localhost -U postgres -d nova_english

# Check DATABASE_URL format
echo $DATABASE_URL

# Regenerate Prisma Client
npm run prisma:generate
```

### CORS Errors

```bash
# Check CORS_ORIGIN in .env
cat .env | grep CORS_ORIGIN

# Must match frontend URL exactly (no trailing slash)
# ❌ Wrong: https://example.com/
# ✅ Correct: https://example.com

# Restart server after .env change
npm run dev
```

### JWT Token Issues

```bash
# Check JWT_SECRET is set
cat .env | grep JWT_SECRET

# Ensure secret is long enough (min 32 chars)
openssl rand -base64 32
```

### File Upload Fails

```bash
# Check uploads directory exists and writable
ls -la uploads/

# Create if not exists
mkdir -p uploads/images uploads/audio
chmod 755 uploads

# Check file size limits in .env
cat .env | grep MEDIA_MAX
```

### PM2 Not Starting

```bash
# Check logs
pm2 logs novaenglish-api --lines 100

# Delete and restart
pm2 delete novaenglish-api
pm2 start ecosystem.config.cjs

# Check Node version
node -v  # Must be >= 18.18.0
```

### Email Not Sending

```bash
# Test SMTP connection
npm run test:smtp  # If you create this script

# Check Gmail settings:
# - 2-Step Verification enabled
# - App Password generated (16 digits)
# - Less secure app access (if using password)

# Check credentials
cat .env | grep SMTP
```

---

## 🔒 Security Best Practices

### Production Checklist

- [ ] Use strong JWT_SECRET (min 32 chars)
- [ ] Set COOKIE_SECURE=true (HTTPS only)
- [ ] Set COOKIE_SAMESITE=None or Lax
- [ ] Use environment variables (never hardcode secrets)
- [ ] Set proper CORS_ORIGIN (no wildcards)
- [ ] Enable rate limiting
- [ ] Use HTTPS/SSL certificate
- [ ] Secure .env file permissions: `chmod 600 .env`
- [ ] Regular database backups
- [ ] Monitor logs for suspicious activity
- [ ] Keep dependencies updated: `npm audit`

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👥 Support

Jika ada masalah:

1. Check [Troubleshooting](#troubleshooting) section
2. Check logs: `pm2 logs novaenglish-api`
3. Review [DEPLOYMENT.md](./DEPLOYMENT.md)
4. Check [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)

---

## 🔗 Related Documentation

- **[QUICK-START.md](./QUICK-START.md)** - Quick deployment guide
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Full deployment guide
- **[PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)** - Production checklist
- **[.env.example](./.env.example)** - Environment variables template
- **[.env.production](./.env.production)** - Production env template

---

**Happy coding! 🚀**

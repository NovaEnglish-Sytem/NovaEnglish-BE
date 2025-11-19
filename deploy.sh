#!/bin/bash
# Simple deployment script untuk Dewacloud

echo "🚀 Deploying NovaEnglish API..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma..."
npm run prisma:generate

# Run migrations
echo "🗄️ Running migrations..."
npm run prisma:deploy

# Build Next.js
echo "🏗️ Building..."
npm run build

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs

echo "✅ Deployment complete!"
echo "Run: pm2 logs novaenglish-api"

#!/bin/bash

#########################################
# NovaEnglish Backend Deployment Script
# 
# Usage:
#   ./deploy.sh              # Normal deployment
#   ./deploy.sh --no-build   # Skip build (faster)
#   ./deploy.sh --fresh      # Fresh install (delete node_modules)
#
# Requirements:
#   - Node.js >= 18.18.0
#   - PM2 installed globally
#   - .env file configured
#   - PostgreSQL database accessible
#########################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_BUILD=false
FRESH_INSTALL=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --no-build) SKIP_BUILD=true ;;
        --fresh) FRESH_INSTALL=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Start deployment
echo ""
echo "========================================="
echo "🚀 NovaEnglish Backend Deployment"
echo "========================================="
echo ""

# Check Node.js version
log_info "Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.18.0"

if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
    log_error "Node.js version must be >= $REQUIRED_VERSION (current: $NODE_VERSION)"
    exit 1
fi
log_success "Node.js version: v$NODE_VERSION"

# Check if .env exists
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_warning "Please create .env file from .env.production template"
    exit 1
fi
log_success ".env file found"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 not found!"
    log_warning "Installing PM2 globally..."
    npm install -g pm2
    log_success "PM2 installed"
fi

# Fresh install (optional)
if [ "$FRESH_INSTALL" = true ]; then
    log_warning "Fresh install requested - removing node_modules..."
    rm -rf node_modules
    rm -f package-lock.json
    log_success "Cleaned up"
fi

# Install dependencies
log_info "Installing dependencies..."
npm ci || npm install
log_success "Dependencies installed"

# Generate Prisma client
log_info "Generating Prisma client..."
npm run prisma:generate
log_success "Prisma client generated"

# Check database connection
log_info "Checking database connection..."
if ! npm run prisma:generate &> /dev/null; then
    log_error "Database connection failed!"
    log_warning "Please check DATABASE_URL in .env file"
    exit 1
fi
log_success "Database connected"

# Run migrations
log_info "Running database migrations..."
if npm run prisma:deploy; then
    log_success "Migrations completed"
else
    log_error "Migration failed!"
    log_warning "Please check database credentials and schema"
    exit 1
fi

# Build Next.js (optional)
if [ "$SKIP_BUILD" = false ]; then
    log_info "Building Next.js application..."
    if npm run build; then
        log_success "Build completed"
    else
        log_error "Build failed!"
        exit 1
    fi
else
    log_warning "Skipping build (--no-build flag)"
fi

# Create logs directory if not exists
if [ ! -d "logs" ]; then
    log_info "Creating logs directory..."
    mkdir -p logs
    log_success "Logs directory created"
fi

# PM2 management
log_info "Managing PM2 process..."

# Check if app is already running
if pm2 describe novaenglish-api &> /dev/null; then
    log_warning "App is already running, restarting..."
    pm2 restart ecosystem.config.cjs --update-env
    log_success "App restarted"
else
    log_info "Starting app for the first time..."
    pm2 start ecosystem.config.cjs
    log_success "App started"
fi

# Save PM2 configuration
log_info "Saving PM2 process list..."
pm2 save
log_success "PM2 configuration saved"

# Check PM2 status
echo ""
log_info "Current PM2 status:"
pm2 status

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
log_success "Application is now running in production mode"
echo ""
echo "📊 Useful Commands:"
echo "  - View logs:    pm2 logs novaenglish-api"
echo "  - Monitor:      pm2 monit"
echo "  - Restart:      pm2 restart novaenglish-api"
echo "  - Stop:         pm2 stop novaenglish-api"
echo "  - Status:       pm2 status"
echo ""
echo "🔍 Health Check:"
echo "  curl http://localhost:3001/api/health"
echo ""

# Reminder for first-time setup
if ! pm2 startup &> /dev/null; then
    log_warning "Don't forget to setup PM2 auto-start on reboot:"
    echo "  pm2 startup"
    echo "  (then run the command it provides)"
    echo ""
fi

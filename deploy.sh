#!/bin/bash
set -e

echo "🚀 Deploy started..."

cd ~/Xpenses-backend

echo "📥 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
npm install --production

echo "🔁 Restarting server..."
pm2 restart xpenses-api

echo "✅ Deploy completed!"

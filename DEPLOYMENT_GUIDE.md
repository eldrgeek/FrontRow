# 🚀 FRONT ROW - Production Deployment Guide

## Overview

This guide walks you through deploying your FRONT ROW virtual theater application:
- **Backend**: Deploy to Render (Node.js + Socket.IO)
- **Frontend**: Deploy to Netlify (Vite + React + TypeScript)

## 📋 Prerequisites

- [x] GitHub account with your code pushed
- [x] Render account (free tier available)
- [x] Netlify account (free tier available)

---

## 🎭 Part 1: Deploy Backend to Render

### Step 1: Connect Repository to Render

1. **Sign up/Login to Render**: https://render.com
2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select your FRONT ROW repository
   - Choose "Deploy from a branch" (usually `main` or `master`)

### Step 2: Configure Render Service

**Basic Settings:**
- **Name**: `frontrow-backend` (or your preference)
- **Runtime**: `Node`
- **Region**: `Oregon (US West)` (or closest to your audience)
- **Branch**: `main` (or your main branch)
- **Root Directory**: `server`

**Build & Deploy:**
- **Build Command**: `npm install`
- **Start Command**: `node index.js`

**Instance Type:**
- **Free Tier**: Select "Free" (512MB RAM, sleeps after 15min inactivity)
- **Paid**: Select "Starter" ($7/month) for better performance

### Step 3: Set Environment Variables in Render

In your Render service dashboard, go to **Environment** and add:

```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://frontrowtheater.netlify.app
PORT=10000
```

### Step 4: Deploy and Test Backend

1. **Deploy**: Render will automatically deploy when you save
2. **Copy Service URL**: Find your service URL (e.g., `https://frontrow-backend.onrender.com`)
3. **Test Health Check**: Visit `https://your-render-url.onrender.com/health`

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123.45,
  "environment": "production",
  "activeConnections": 0
}
```

---

## 🌐 Part 2: Deploy Frontend to Netlify

### Step 1: Connect Repository to Netlify

1. **Sign up/Login to Netlify**: https://netlify.com
2. **Add New Site**:
   - Click "Add new site" → "Import an existing project"
   - Choose "Deploy with GitHub"
   - Select your FRONT ROW repository

### Step 2: Configure Netlify Build Settings

**Build Settings:**
- **Base directory**: `front-row-vite`
- **Build command**: `npm run build`
- **Publish directory**: `front-row-vite/dist`

**Advanced Settings:**
- **Node version**: `18` (set in Environment variables)

### Step 3: Set Environment Variables in Netlify

In your Netlify site dashboard, go to **Site settings** → **Environment variables** and add:

```bash
NODE_ENV=production
VITE_BACKEND_URL=https://frontrow-tvu6.onrender.com
VITE_SOCKET_URL=https://frontrow-tvu6.onrender.com
NODE_VERSION=18
```

### Step 4: Deploy and Test Frontend

1. **Deploy**: Click "Deploy site"
2. **Copy Site URL**: Find your site URL (e.g., `https://wonderful-app-123.netlify.app`)
3. **Test Application**: Visit your Netlify URL

---

## 🔄 Part 3: Connect Frontend and Backend

### Update Backend CORS Settings

1. **Return to Render Dashboard**
2. **Update Environment Variables**:
   ```bash
   ALLOWED_ORIGINS=https://your-netlify-app.netlify.app
   ```
3. **Redeploy Backend** (automatic on save)

### Test Full Integration

1. **Visit your Netlify URL**
2. **Open Browser Console** (F12)
3. **Look for connection logs**: `"Connecting to backend: https://..."`
4. **Test features**:
   - Enter name and take picture
   - Select a seat
   - Check real-time updates work

---

## 🎯 Part 4: Custom Domains (Optional)

### For Netlify (Frontend)
1. **Purchase domain** from any registrar
2. **In Netlify**: Site settings → Domain management
3. **Add custom domain** and follow DNS setup instructions

### For Render (Backend)
1. **Purchase domain** from any registrar  
2. **In Render**: Service settings → Custom domains
3. **Add domain** and update DNS records

---

## 🔧 Environment Configuration Summary

### Render Backend Environment Variables:
```bash
NODE_ENV=production
ALLOWED_ORIGINS=https://your-netlify-app.netlify.app
PORT=10000
```

### Netlify Frontend Environment Variables:
```bash
NODE_ENV=production
VITE_BACKEND_URL=https://your-render-backend.onrender.com
VITE_SOCKET_URL=https://your-render-backend.onrender.com
NODE_VERSION=18
```

---

## 🚨 Important Production Notes

### Security
- ✅ **CORS properly configured** - only your frontend can access backend
- ✅ **HTTPS enforced** - both services use secure connections
- ✅ **No hardcoded secrets** - all URLs use environment variables

### Performance
- ⚠️ **Render Free Tier**: Backend sleeps after 15min inactivity (30s wake-up)
- ✅ **Netlify**: Frontend serves instantly from global CDN
- ✅ **WebRTC**: Peer-to-peer video reduces server load

### Monitoring
- **Backend Health**: `https://your-render-url.onrender.com/health`
- **Render Logs**: Available in Render dashboard
- **Netlify Logs**: Available in Netlify dashboard

---

## 🛠 Development vs Production

### Development (Local)
```bash
# Backend
cd server && npm start
# Frontend  
cd front-row-vite && npm run dev
# Access: http://localhost:5173
```

### Production (Deployed)
```bash
# Backend: Automatically runs on Render
# Frontend: Automatically builds and deploys on Netlify
# Access: https://your-netlify-app.netlify.app
```

---

## 🎉 Success Checklist

- [ ] ✅ Backend deployed to Render
- [ ] ✅ Backend health check returns 200 OK
- [ ] ✅ Frontend deployed to Netlify
- [ ] ✅ Frontend loads without errors
- [ ] ✅ Console shows successful backend connection
- [ ] ✅ Can enter name and take picture
- [ ] ✅ Can select seats
- [ ] ✅ Real-time updates work between users
- [ ] ✅ Artist mode works (`?role=artist`)
- [ ] ✅ WebRTC video streaming functions

**🎭 Your FRONT ROW virtual theater is now live in production!**

---

## 📞 Troubleshooting

### Backend Issues
- **"Application failed to start"**: Check build logs in Render
- **CORS errors**: Verify `ALLOWED_ORIGINS` matches your Netlify URL exactly
- **Health check fails**: Check server logs for startup errors

### Frontend Issues  
- **"Failed to load resource"**: Check `VITE_BACKEND_URL` environment variable
- **Socket connection fails**: Verify backend is running and CORS is configured
- **Build fails**: Check Node version is set to 18 in Netlify

### WebRTC Issues
- **Video not working**: Ensure HTTPS is used (required for camera access)
- **Connection fails**: Check browser console for WebRTC-specific errors
- **Audio issues**: Browser autoplay policies may prevent audio

Need help? Check the logs in your respective dashboards or console errors in the browser. 
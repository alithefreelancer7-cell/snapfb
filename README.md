# SnapFB – Facebook Video Downloader

A full-stack web app to download Facebook Reels, Stories, and long videos using **yt-dlp** as the backend engine.

---

## 📁 Project Structure

```
snapfb/
├── server.js          ← Node.js/Express backend
├── package.json
├── .env               ← (optional) PORT config
├── public/
│   └── index.html     ← Frontend (SEO-optimised)
└── README.md
```

---

## ⚙️ Requirements

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| npm | >= 8 |
| Python | >= 3.8 |
| yt-dlp | latest |
| ffmpeg | any recent |

---

## 🚀 Local Setup (Step by Step)

### Step 1 — Install yt-dlp
```bash
pip install yt-dlp
# or on macOS with Homebrew:
brew install yt-dlp
```

### Step 2 — Install ffmpeg (required for HD merging)
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows — download from https://ffmpeg.org/download.html
# and add to PATH
```

### Step 3 — Install Node dependencies
```bash
cd snapfb
npm install
```

### Step 4 — Start the server
```bash
npm start
# Server runs at http://localhost:3000
```

Open your browser at **http://localhost:3000** and start downloading!

---

## 🌐 Deploy to a VPS (Ubuntu)

### Install everything on server
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python + yt-dlp
sudo apt install -y python3 python3-pip
pip3 install yt-dlp

# Install ffmpeg
sudo apt install -y ffmpeg

# Clone or upload your project
git clone https://github.com/yourname/snapfb.git
cd snapfb
npm install
```

### Run with PM2 (keeps it alive 24/7)
```bash
npm install -g pm2
pm2 start server.js --name snapfb
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### Set up Nginx reverse proxy
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/snapfb
```

Paste this Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Important for large video downloads
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/snapfb /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Add HTTPS with Let's Encrypt (free SSL)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## ☁️ Deploy to Render.com (Easy Free Hosting)

1. Push your code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Set:
   - **Build Command:** `npm install && pip install yt-dlp`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add environment variable: `PORT=10000`
6. Click Deploy ✅

> Note: Render free tier sleeps after inactivity. Use a paid plan for production.

---

## 🔑 Environment Variables

Create a `.env` file:
```env
PORT=3000
```

---

## ⚠️ Important Notes

- **Public videos only** — yt-dlp cannot bypass Facebook's auth for private/friends-only videos.
- **Cookies (optional)** — For age-restricted or semi-private content, you can pass cookies:
  - Log into Facebook in your browser
  - Export cookies with a browser extension like "Get cookies.txt LOCALLY"
  - Save as `cookies.txt` in the project root
  - Uncomment the `--cookies cookies.txt` line in server.js
- **Rate limiting** — Add `express-rate-limit` for production to prevent abuse
- **Legal** — Only download content you own or have permission to download

---

## 📦 Optional: Add Rate Limiting

```bash
npm install express-rate-limit
```

Add to server.js after middleware setup:
```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 requests per IP
  message: { error: 'Too many requests. Please try again later.' }
}));
```

---

## 📄 License
MIT — use freely, credit appreciated.

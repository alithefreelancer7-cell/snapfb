const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(helmet({ contentSecurityPolicy: false })); // relax CSP for serving HTML
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve frontend

// ── HELPERS ──

// Validate that the URL is a real Facebook/fb URL
function isValidFBUrl(url) {
  try {
    const u = new URL(url);
    return /^(www\.)?(facebook\.com|fb\.com|fb\.watch|m\.facebook\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

// Run yt-dlp and return a Promise with stdout/stderr
function ytDlp(args) {
  return new Promise((resolve, reject) => {
    const cmd = ['yt-dlp', ...args].join(' ');
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// ── ROUTE: GET VIDEO INFO ──
// POST /api/info  { url: "https://facebook.com/..." }
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url || !isValidFBUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing Facebook URL.' });
  }

  try {
    // Fetch JSON metadata from yt-dlp (no download)
    const raw = await ytDlp([
      '--dump-json',
      '--no-playlist',
      '--cookies-from-browser', 'firefox', // optional: helps with some private content
      `"${url}"`
    ]);

    const info = JSON.parse(raw);

    // Build quality options from available formats
    const formats = (info.formats || []).filter(f => f.vcodec !== 'none');
    
    const hdFormat = formats.filter(f => (f.height || 0) >= 720).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    const sdFormat = formats.filter(f => (f.height || 0) < 720 && (f.height || 0) >= 360).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    const fallback = formats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];

    const audioFormat = (info.formats || []).filter(f => f.vcodec === 'none' && f.acodec !== 'none').sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

    const qualities = [];
    if (hdFormat) qualities.push({ label: 'HD', resolution: `${hdFormat.height}p`, formatId: hdFormat.format_id, ext: hdFormat.ext });
    if (sdFormat) qualities.push({ label: 'SD', resolution: `${sdFormat.height}p`, formatId: sdFormat.format_id, ext: sdFormat.ext });
    if (!hdFormat && !sdFormat && fallback) qualities.push({ label: 'Best', resolution: fallback.height ? `${fallback.height}p` : 'Best', formatId: fallback.format_id, ext: fallback.ext });
    if (audioFormat) qualities.push({ label: 'Audio', resolution: 'MP3', formatId: audioFormat.format_id, ext: 'mp3' });

    res.json({
      title: info.title || 'Facebook Video',
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || null,
      qualities,
    });

  } catch (err) {
    console.error('yt-dlp info error:', err.message);
    res.status(500).json({
      error: 'Could not fetch video info. The video may be private, deleted, or age-restricted.',
      detail: err.message,
    });
  }
});

// ── ROUTE: DOWNLOAD VIDEO ──
// GET /api/download?url=...&formatId=...&label=...
app.get('/api/download', async (req, res) => {
  const { url, formatId, label } = req.query;

  if (!url || !isValidFBUrl(url)) {
    return res.status(400).json({ error: 'Invalid Facebook URL.' });
  }

  // Create a temp file path
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `snapfb_${Date.now()}.%(ext)s`);

  try {
    // Build yt-dlp download command
    const ytArgs = [
      '--no-playlist',
      '--output', `"${tmpFile}"`,
    ];

    if (label === 'Audio') {
      ytArgs.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      ytArgs.push('--format', formatId ? `"${formatId}+bestaudio/best"` : 'best');
      ytArgs.push('--merge-output-format', 'mp4');
    }

    ytArgs.push(`"${url}"`);

    // Run download
    await ytDlp(ytArgs);

    // Find the actual output file (yt-dlp fills in the extension)
    const ext = label === 'Audio' ? 'mp3' : 'mp4';
    const actualFile = tmpFile.replace('%(ext)s', ext);

    if (!fs.existsSync(actualFile)) {
      // Try to find it with glob pattern
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`snapfb_`) && (f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.webm')));
      if (files.length === 0) throw new Error('Downloaded file not found.');
      const found = path.join(tmpDir, files[files.length - 1]);
      return sendFile(res, found, label, () => fs.unlinkSync(found));
    }

    sendFile(res, actualFile, label, () => {
      try { fs.unlinkSync(actualFile); } catch {}
    });

  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed. Video may be private or unavailable.', detail: err.message });
    }
  }
});

function sendFile(res, filePath, label, cleanup) {
  const ext = path.extname(filePath).slice(1);
  const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'webm' ? 'video/webm' : 'video/mp4';
  const filename = `snapfb_${label || 'video'}_${Date.now()}.${ext}`;
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', mime);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('end', () => { try { cleanup(); } catch {} });
  stream.on('error', (e) => { console.error('Stream error:', e); if (!res.headersSent) res.status(500).end(); });
}

// ── CATCH ALL → serve frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ SnapFB server running at http://localhost:${PORT}\n`);
});

module.exports = app;

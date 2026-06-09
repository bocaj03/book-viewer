const { put } = require('@vercel/blob');

// Disable body parsing so we can read the raw file stream
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const authHeader = req.headers['x-admin-password'];
  if (authHeader !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const filename = req.headers['x-file-name'] || 'upload';
  const contentType = req.headers['x-content-type'] || 'application/octet-stream';

  try {
    // Read raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Upload to Vercel Blob using put() which works with OIDC
    const blob = await put(`book-viewer/${filename}`, buffer, {
      access: 'public',
      contentType,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

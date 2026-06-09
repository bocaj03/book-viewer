const { put } = require('@vercel/blob');

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
    // Vercel provides req.body as a Buffer for non-JSON content types
    let body = req.body;

    // If body is a string (base64), convert to Buffer
    if (typeof body === 'string') {
      body = Buffer.from(body, 'base64');
    }

    // If body isn't a Buffer yet, read from stream
    if (!Buffer.isBuffer(body)) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    // Upload to Vercel Blob using put() which works with OIDC
    const blob = await put(`book-viewer/${filename}`, body, {
      access: 'public',
      contentType,
    });

    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

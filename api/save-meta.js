const { put, del, list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const authHeader = req.headers['x-admin-password'];
  if (authHeader !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    const body = req.body;

    if (!body.title) {
      return res.status(400).json({ error: 'Missing title' });
    }

    // Delete old metadata
    const { blobs: oldMeta } = await list({ prefix: 'book-viewer/meta' });
    for (const blob of oldMeta) {
      await del(blob.url);
    }

    // Save new metadata (supports both PDF and EPUB formats)
    const meta = {
      title: body.title,
      format: body.format || 'pdf',
      coverUrl: body.coverUrl || null,
      uploadedAt: new Date().toISOString(),
    };

    if (body.format === 'epub') {
      meta.chaptersUrl = body.chaptersUrl;
      meta.chapterCount = body.chapterCount;
    } else {
      meta.pageUrls = body.pageUrls;
    }

    await put('book-viewer/meta.json', JSON.stringify(meta), {
      access: 'public',
      contentType: 'application/json',
    });

    return res.status(200).json({ success: true, ...meta });
  } catch (err) {
    console.error('Save meta error:', err);
    return res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
};

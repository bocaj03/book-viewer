const { put, del, list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin password
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
  }

  const authHeader = req.headers['x-admin-password'];
  if (authHeader !== adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    // Parse multipart form data manually from the request
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({ error: 'Expected application/json' });
    }

    // Collect body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());

    const { title, pdfData, pdfName, coverData } = body;

    if (!pdfData || !title) {
      return res.status(400).json({ error: 'Missing title or PDF data' });
    }

    // Delete old files
    const { blobs: oldBlobs } = await list({ prefix: 'book-viewer/' });
    for (const blob of oldBlobs) {
      await del(blob.url);
    }

    // Upload PDF
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    const pdfBlob = await put(`book-viewer/document${getExt(pdfName)}`, pdfBuffer, {
      access: 'public',
      contentType: getMimeType(pdfName),
    });

    // Upload cover image if provided
    let coverUrl = null;
    if (coverData) {
      // coverData is a data URL like "data:image/png;base64,..."
      const matches = coverData.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const coverBuffer = Buffer.from(matches[2], 'base64');
        const ext = matches[1].split('/')[1] || 'png';
        const coverBlob = await put(`book-viewer/cover.${ext}`, coverBuffer, {
          access: 'public',
          contentType: matches[1],
        });
        coverUrl = coverBlob.url;
      }
    }

    // Save metadata
    const meta = {
      title,
      pdfUrl: pdfBlob.url,
      coverUrl,
      uploadedAt: new Date().toISOString(),
    };

    await put('book-viewer/meta.json', JSON.stringify(meta), {
      access: 'public',
      contentType: 'application/json',
    });

    return res.status(200).json({ success: true, ...meta });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

function getExt(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '.pdf';
}

function getMimeType(filename) {
  const ext = getExt(filename).toLowerCase();
  const types = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return types[ext] || 'application/octet-stream';
}

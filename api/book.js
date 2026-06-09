const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Look for our metadata file in blob storage
    const { blobs } = await list({ prefix: 'book-viewer/meta' });

    if (blobs.length === 0) {
      return res.status(200).json({ exists: false });
    }

    // Fetch the metadata
    const metaBlob = blobs[0];
    const metaRes = await fetch(metaBlob.url);
    const meta = await metaRes.json();

    return res.status(200).json({ exists: true, ...meta });
  } catch (err) {
    console.error('Error fetching book:', err);
    return res.status(500).json({ error: 'Failed to fetch book data' });
  }
};

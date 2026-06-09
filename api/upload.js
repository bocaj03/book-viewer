const { handleUpload } = require('@vercel/blob/client');

module.exports = async function handler(req, res) {
  try {
    const body = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Check admin password
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) throw new Error('ADMIN_PASSWORD not configured');

        let payload;
        try {
          payload = JSON.parse(clientPayload || '{}');
        } catch {
          throw new Error('Invalid payload');
        }

        if (payload.password !== adminPassword) {
          throw new Error('Invalid password');
        }

        return {
          allowedContentTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Nothing needed here — metadata saved separately
      },
    });

    return res.status(200).json(body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

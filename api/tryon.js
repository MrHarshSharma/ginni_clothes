// Serverless Virtual Try-On endpoint.
//
// Deploys as /api/tryon on Vercel (or any Node serverless host that exposes
// (req, res) handlers). Calls Google's Gemini 2.5 Flash Image model to render
// the garment onto the user's uploaded photo.
//
// Required environment variable:
//   GEMINI_API_KEY  – your Google AI Studio API key (https://aistudio.google.com/apikey)
//
// The key is read server-side only and is never exposed to the browser.

const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Strip a data-URL prefix and return { mimeType, data }.
function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

// Fetch a remote image and return it as { mimeType, data(base64) }.
async function fetchImageAsBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load the garment image (${r.status})`);
  const mimeType = r.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await r.arrayBuffer());
  return { mimeType, data: buf.toString('base64') };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured (missing GEMINI_API_KEY).' });
    return;
  }

  try {
    // Body may arrive parsed (Vercel) or raw (other hosts).
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }

    const { userImage, garmentImageUrl, productName, category, variation } = body;

    const user = parseDataUrl(userImage);
    if (!user) { res.status(400).json({ error: 'Invalid user photo.' }); return; }
    if (!garmentImageUrl) { res.status(400).json({ error: 'Missing garment image.' }); return; }

    const garment = await fetchImageAsBase64(garmentImageUrl);

    const prompt =
      `You are a virtual fashion try-on assistant. The FIRST image is a photo of a person. ` +
      `The SECOND image shows a garment: "${productName || 'an outfit'}"${category ? ` (${category})` : ''}. ` +
      `Generate a photorealistic image of the SAME person from the first photo now wearing this garment. ` +
      `Use the single main, front-most person as the subject. ` +
      `IMPORTANT: The first photo may show the person more than once or include other people in the background. ` +
      `The result must contain EXACTLY ONE person — only that main subject — wearing the garment. Completely ` +
      `remove every other person, duplicate, reflection or background figure, and remove anyone still in the ` +
      `original clothes. Replace the area they occupied with a clean, plain studio background that matches the ` +
      `rest of the scene. ` +
      `Preserve the main person's face, body shape, skin tone, hair and pose exactly, and keep a simple, ` +
      `uncluttered background. ` +
      `GARMENT FIDELITY IS THE TOP PRIORITY. Treat the SECOND image as the exact ground-truth reference and ` +
      `reproduce that garment as faithfully and identically as possible — do NOT redesign, restyle, simplify or ` +
      `invent any part of it. Copy precisely: the exact colour and fabric sheen; every embroidery and zari motif ` +
      `and its placement; the neckline and blouse/bodice design; the sleeve length and cut; the border and hem ` +
      `pattern; the dupatta/scarf and how it falls; and any beadwork, sequins or print. The motif layout, density ` +
      `and gold-work pattern must look the same as the reference, not a different floral pattern. ` +
      `Only adapt the garment's fit and drape to the person's body and pose; keep every design detail identical. ` +
      `Render it photorealistically with natural folds, lighting and shadows consistent with the first photo. ` +
      (variation > 1
        ? `This is regeneration attempt #${variation}: keep the same person and background, and match the ` +
          `garment's embroidery and details even more closely to the reference image. `
        : '') +
      `Output only the final edited photo.`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          // Order matters: FIRST = customer (the base we keep), SECOND = outfit reference
          { inline_data: { mime_type: user.mimeType, data: user.data } },
          { inline_data: { mime_type: garment.mimeType, data: garment.data } },
        ],
      }],
    };

    const apiRes = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => '');
      console.error('Gemini error', apiRes.status, detail);
      res.status(502).json({ error: 'The try-on service is busy. Please try again.' });
      return;
    }

    const data = await apiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData || p.inline_data);
    const inline = imgPart && (imgPart.inlineData || imgPart.inline_data);

    if (!inline?.data) {
      // Model declined or returned text only (e.g. safety) — surface a friendly message.
      const textPart = parts.find(p => p.text);
      res.status(422).json({ error: textPart?.text || 'Could not generate a try-on for this photo. Try a clear, full-body image.' });
      return;
    }

    const mime = inline.mimeType || inline.mime_type || 'image/png';
    res.status(200).json({ image: `data:${mime};base64,${inline.data}` });
  } catch (err) {
    console.error('try-on handler error', err);
    res.status(500).json({ error: 'Unexpected error generating the try-on.' });
  }
};

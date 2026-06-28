# Virtual Try-On — Setup

The product page now has a **"Try It On"** button. It sends the shopper's photo +
the product image to a small serverless function (`api/tryon.js`), which calls
Google's **Gemini 2.5 Flash Image** model to render the garment onto the shopper.

The AI API key lives only on the server — never in the browser.

## 1. Get an API key

1. Go to https://aistudio.google.com/apikey and create an API key.
2. (Image generation is a paid feature — confirm billing is enabled on the key's
   Google Cloud project.)

## 2. Deploy on Vercel (recommended)

This repo is plain static HTML + one function, which Vercel serves as-is.

```bash
npm i -g vercel        # if you don't have it
vercel                 # first deploy (link/create project)
vercel env add GEMINI_API_KEY    # paste your key, choose Production + Preview
vercel --prod          # deploy with the env var
```

That's it — `api/tryon.js` is auto-detected and served at `/api/tryon`, and
`product.html` calls it relative to the same domain.

> Netlify/Cloudflare also work, but the function signature (`module.exports =
> (req, res) => …`) is Vercel-style. On Netlify, move it to
> `netlify/functions/tryon.js` and adapt the handler to `(event) => ({ statusCode, body })`.

## 3. Test locally

```bash
vercel dev             # runs the static site + the function together
```

Open the product page, click **Try It On**, upload a clear full-body photo, and
press **Generate**.

## Cost & behaviour notes

- Each generation is one image-model call (priced per output image — check current
  Gemini image pricing). Consider rate-limiting or requiring login before launch.
- The shopper's photo is downscaled to ≤1024px in the browser before upload, and
  is not persisted by the function.
- Results are AI approximations; the UI already shows a disclaimer to that effect.
- Best results come from clean, front-facing product images. The styled catalogue
  photos work, but a flat/ghost-mannequin garment shot improves accuracy.

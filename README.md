# PDF Studio

An offline-first browser project for the Week 2 PDF Studio brief. It uses bundled local PDF engines and makes no network request.

## Run

Open `index.html` in Edge or Chrome. Add ordinary, non-password-protected PDFs, arrange the pages and click **Merge and download**.

The secure-redaction export deliberately flattens every output page to an image after applying black redaction areas. This prevents redacted text from remaining selectable or searchable, but it also means all other output text is no longer selectable. Use this mode only when that trade-off is appropriate.

## Build roadmap

1. Organise: merge, page reorder, rotate, delete, duplicate, extract, blank-page insert, split and crop.
2. Edit: text, image, highlight, line/shape, whiteout and secure redaction; form filling remains.
3. Stamp: watermark, numbers, header/footer and date.
4. Convert: images to PDF; PDF to images and PDF to text remain.
5. Finish: compression report; metadata and compare remain.

Use fictional or harmless test PDFs only. Never rely on a visual black rectangle as redaction; final redaction must remove or rasterise the underlying searchable text.

## Third-party notice

Secure redaction uses the bundled Mozilla PDF.js files in `vendor/`. Their license is included as `vendor/PDFJS-LICENSE`.

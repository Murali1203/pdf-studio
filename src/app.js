const $ = (id) => document.getElementById(id);
const state = {
  documents: [], pages: [], pdfCache: new Map(), sequence: 0,
  edit: { pageNumbers: false, pageNumberPosition: "bottom-center", watermark: "", watermarkOpacity: 0.15, note: "", image: null, overlays: [], redactions: [] },
  stamp: { dateEnabled: false, dateValue: "", customText: "", position: "top-left", signature: null },
  finish: { optimise: true, exportName: "pdf-studio-organised", addDetails: false, removeDetails: false, title: "", author: "", subject: "", compareFirst: null, compareSecond: null },
  converter: { images: [], textPdf: null, imagePdf: null },
  form: { pdf: null, fields: [] }
};

const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatDifference = (value) => `${value >= 0 ? "+" : ""}${(value / 1024).toFixed(1)} KB`;
const setStatus = (message) => { $("status").textContent = message; };
const makeId = (prefix) => `${prefix}-${++state.sequence}`;
const selectedPages = () => state.pages.filter((page) => page.selected);

function updateActions() {
  const hasDocuments = state.documents.length > 0;
  const selectionExists = selectedPages().length > 0;
  $("file-count").textContent = `${state.documents.length} file${state.documents.length === 1 ? "" : "s"}`;
  $("page-count").textContent = `${state.pages.length} page${state.pages.length === 1 ? "" : "s"}`;
  $("clear-files").disabled = !hasDocuments;
  $("merge-files").disabled = state.pages.length === 0;
  ["extract-selected", "split-selected", "blank-after-selected", "crop-selected"].forEach((id) => { $(id).disabled = !selectionExists; });
  $("add-overlay").disabled = !selectionExists;
  $("clear-overlays").disabled = state.edit.overlays.length === 0;
  $("overlay-count").textContent = `${state.edit.overlays.length} mark${state.edit.overlays.length === 1 ? "" : "s"}`;
  $("add-redaction").disabled = !selectionExists;
  $("clear-redactions").disabled = state.edit.redactions.length === 0;
  $("redaction-count").textContent = `${state.edit.redactions.length} redaction${state.edit.redactions.length === 1 ? "" : "s"}`;
  $("input-size").textContent = hasDocuments ? formatBytes(state.documents.reduce((total, item) => total + item.file.size, 0)) : "—";
  $("image-count").textContent = `${state.converter.images.length} image${state.converter.images.length === 1 ? "" : "s"}`;
  $("clear-images").disabled = state.converter.images.length === 0;
  $("create-image-pdf").disabled = state.converter.images.length === 0;
  $("export-text").disabled = !state.converter.textPdf;
  $("export-images").disabled = !state.converter.imagePdf;
  $("save-filled-form").disabled = !state.form.pdf;
  $("form-field-count").textContent = `${state.form.fields.length} field${state.form.fields.length === 1 ? "" : "s"}`;
  $("compare-pdfs").disabled = !state.finish.compareFirst || !state.finish.compareSecond;
}

function removeDocument(documentId) {
  const documentItem = state.documents.find((item) => item.id === documentId);
  state.documents = state.documents.filter((item) => item.id !== documentId);
  state.pages = state.pages.filter((page) => page.documentId !== documentId);
  state.pdfCache.delete(documentId);
  render();
  setStatus(`${documentItem?.file.name || "PDF"} removed from the local plan.`);
}

function renderDocuments() {
  const list = $("file-list");
  list.replaceChildren();
  if (!state.documents.length) {
    list.innerHTML = '<p class="empty">No PDFs selected yet.</p>';
    return;
  }
  state.documents.forEach((documentItem, index) => {
    const row = document.createElement("article"); row.className = "file-row";
    const info = document.createElement("div");
    const name = document.createElement("div"); name.className = "file-name"; name.textContent = `${index + 1}. ${documentItem.file.name}`;
    const meta = document.createElement("div"); meta.className = "file-meta"; meta.textContent = `${documentItem.pageCount} page${documentItem.pageCount === 1 ? "" : "s"} · ${formatBytes(documentItem.file.size)}`;
    const remove = document.createElement("button"); remove.className = "icon-button"; remove.textContent = "Remove"; remove.addEventListener("click", () => removeDocument(documentItem.id));
    info.append(name, meta); row.append(info, remove); list.append(row);
  });
}

function blankPage() {
  return { id: makeId("blank"), type: "blank", rotation: 0, selected: false, width: 595.28, height: 841.89, cropMargin: 0 };
}

function changePage(index, action) {
  if (action === "up" && index > 0) [state.pages[index - 1], state.pages[index]] = [state.pages[index], state.pages[index - 1]];
  if (action === "down" && index < state.pages.length - 1) [state.pages[index + 1], state.pages[index]] = [state.pages[index], state.pages[index + 1]];
  if (action === "rotate") state.pages[index].rotation = (state.pages[index].rotation + 90) % 360;
  if (action === "duplicate") state.pages.splice(index + 1, 0, { ...state.pages[index], id: makeId("page"), selected: false });
  if (action === "delete") state.pages.splice(index, 1);
  render();
  setStatus({ up: "Page moved earlier in the export plan.", down: "Page moved later in the export plan.", rotate: "Page will rotate 90° clockwise in the export.", duplicate: "Page duplicated in the export plan.", delete: "Page removed from the export plan. The original PDF is unchanged." }[action]);
}

function pageLabel(page) {
  if (page.type === "blank") return "Blank A4 page";
  const documentItem = state.documents.find((item) => item.id === page.documentId);
  return `Page ${page.sourcePage + 1} · ${documentItem?.file.name || "Source PDF"}`;
}

function renderPages() {
  const list = $("page-list"); list.replaceChildren();
  if (!state.pages.length) { list.innerHTML = '<p class="empty">Add a PDF to arrange its pages.</p>'; return; }
  state.pages.forEach((page, index) => {
    const row = document.createElement("article"); row.className = "page-row";
    const check = document.createElement("input"); check.type = "checkbox"; check.className = "page-check"; check.checked = page.selected;
    check.setAttribute("aria-label", `Select ${pageLabel(page)}`);
    check.addEventListener("change", () => { page.selected = check.checked; updateActions(); });
    const order = document.createElement("strong"); order.className = "page-order"; order.textContent = index + 1;
    const info = document.createElement("div");
    const title = document.createElement("div"); title.className = "file-name"; title.textContent = pageLabel(page);
    const meta = document.createElement("div"); meta.className = "file-meta"; meta.textContent = page.rotation ? `Export rotation: ${page.rotation}° clockwise` : "Export rotation: unchanged";
    const controls = document.createElement("div"); controls.className = "page-controls";
    [["Up", "up", index === 0], ["Down", "down", index === state.pages.length - 1], ["Rotate", "rotate", false], ["Copy", "duplicate", false], ["Delete", "delete", false]].forEach(([label, action, disabled]) => {
      const button = document.createElement("button"); button.className = "icon-button"; button.textContent = label; button.disabled = disabled; button.addEventListener("click", () => changePage(index, action)); controls.append(button);
    });
    info.append(title, meta); row.append(check, order, info, controls); list.append(row);
  });
}

function moveImage(index, direction) {
  const target = index + direction;
  [state.converter.images[index], state.converter.images[target]] = [state.converter.images[target], state.converter.images[index]];
  renderImageList();
  setStatus("Image order updated for the converted PDF.");
}

function renderImageList() {
  const list = $("image-list"); list.replaceChildren();
  if (!state.converter.images.length) { list.innerHTML = '<p class="empty">No images selected yet.</p>'; return; }
  state.converter.images.forEach((item, index) => {
    const row = document.createElement("article"); row.className = "file-row image-row";
    const info = document.createElement("div");
    const name = document.createElement("div"); name.className = "file-name"; name.textContent = `${index + 1}. ${item.file.name}`;
    const meta = document.createElement("div"); meta.className = "file-meta"; meta.textContent = `${item.width} × ${item.height} px · ${formatBytes(item.file.size)}`;
    const up = document.createElement("button"); up.className = "icon-button"; up.textContent = "Up"; up.disabled = index === 0; up.addEventListener("click", () => moveImage(index, -1));
    const down = document.createElement("button"); down.className = "icon-button"; down.textContent = "Down"; down.disabled = index === state.converter.images.length - 1; down.addEventListener("click", () => moveImage(index, 1));
    const remove = document.createElement("button"); remove.className = "icon-button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { state.converter.images.splice(index, 1); render(); setStatus("Image removed from the conversion list."); });
    info.append(name, meta); row.append(info, up, down, remove); list.append(row);
  });
}

function render() { updateActions(); renderDocuments(); renderPages(); renderImageList(); }

function updateEditSummary() {
  const parts = [];
  if (state.edit.pageNumbers) parts.push("page numbers");
  if (state.edit.watermark) parts.push("watermark");
  if (state.edit.note) parts.push("note");
  if (state.edit.image) parts.push("image stamp");
  $("edit-summary").textContent = parts.length ? `The exported copy will include: ${parts.join(", ")}.` : "No export-only edits selected.";
}

function updateStampSummary() {
  const parts = [];
  if (state.stamp.dateEnabled) parts.push("date stamp");
  if (state.stamp.customText) parts.push("custom stamp");
  if (state.stamp.signature) parts.push("signature image");
  $("stamp-summary").textContent = parts.length ? `The exported copy will include: ${parts.join(", ")}.` : "No stamps selected.";
}

function updateFinishSummary() {
  $("finish-summary").textContent = state.finish.optimise
    ? "Optimisation removes unnecessary PDF structure where possible; the amount saved depends on the source PDF."
    : "Standard export is selected. Turn on optimisation to compact the PDF structure where possible.";
}

function updateDetailsSummary() {
  let message = "Source document details are not copied into a new PDF export.";
  if (state.finish.removeDetails) message = "The exported PDF will have blanked document details.";
  if (state.finish.addDetails) message = "The entered document details will be written to the exported PDF.";
  $("details-summary").textContent = message;
}

function applyDocumentDetails(output) {
  if (state.finish.removeDetails) {
    output.setTitle(""); output.setAuthor(""); output.setSubject(""); output.setKeywords([]); output.setCreator(""); output.setProducer("");
    return;
  }
  if (state.finish.addDetails) {
    output.setTitle(state.finish.title); output.setAuthor(state.finish.author); output.setSubject(state.finish.subject); output.setCreator("PDF Studio");
  }
}

function pageNumberCoordinates(page, position, label, font) {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(label, 9);
  if (position === "top-right") return { x: width - textWidth - 28, y: height - 22 };
  if (position === "bottom-right") return { x: width - textWidth - 28, y: 18 };
  return { x: (width - textWidth) / 2, y: 18 };
}

async function applyEdits(output) {
  const font = await output.embedFont(PDFLib.StandardFonts.Helvetica);
  let image;
  if (state.edit.image) {
    image = state.edit.image.type === "image/png" ? await output.embedPng(state.edit.image.bytes) : await output.embedJpg(state.edit.image.bytes);
  }
  output.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    if (state.edit.pageNumbers) {
      const label = `Page ${index + 1} of ${output.getPageCount()}`;
      page.drawText(label, { ...pageNumberCoordinates(page, state.edit.pageNumberPosition, label, font), size: 9, font, color: PDFLib.rgb(0.2, 0.3, 0.42) });
    }
    if (state.edit.watermark) {
      const size = Math.min(42, Math.max(18, width / 12));
      const textWidth = font.widthOfTextAtSize(state.edit.watermark, size);
      page.drawText(state.edit.watermark, { x: Math.max(24, (width - textWidth) / 2), y: height / 2, size, font, color: PDFLib.rgb(0.1, 0.45, 0.42), opacity: state.edit.watermarkOpacity, rotate: PDFLib.degrees(35) });
    }
    if (state.edit.note) page.drawText(state.edit.note, { x: 28, y: height - 22, size: 8, font, color: PDFLib.rgb(0.2, 0.3, 0.42), opacity: 0.8, maxWidth: width - 56 });
    if (image) {
      const scaled = image.scaleToFit(Math.min(92, width * 0.18), Math.min(52, height * 0.08));
      page.drawImage(image, { x: width - scaled.width - 28, y: height - scaled.height - 34, width: scaled.width, height: scaled.height, opacity: 0.9 });
    }
  });
}

function colourFromHex(hex) {
  const normalized = hex.replace("#", "");
  return PDFLib.rgb(parseInt(normalized.slice(0, 2), 16) / 255, parseInt(normalized.slice(2, 4), 16) / 255, parseInt(normalized.slice(4, 6), 16) / 255);
}

function drawOverlay(page, overlay) {
  const { width, height } = page.getSize();
  const x = width * overlay.x / 100;
  const markWidth = Math.min(width - x, width * overlay.width / 100);
  const markHeight = Math.min(height - height * overlay.y / 100, height * overlay.height / 100);
  const y = height - height * overlay.y / 100 - markHeight;
  const color = overlay.type === "highlight" ? PDFLib.rgb(1, 0.82, 0.1) : overlay.type === "whiteout" ? PDFLib.rgb(1, 1, 1) : colourFromHex(overlay.colour);
  if (overlay.type === "line") {
    page.drawLine({ start: { x, y: y + markHeight }, end: { x: x + markWidth, y }, thickness: 2.5, color });
    return;
  }
  if (overlay.type === "rectangle") {
    page.drawRectangle({ x, y, width: markWidth, height: markHeight, borderColor: color, borderWidth: 2 });
    return;
  }
  page.drawRectangle({ x, y, width: markWidth, height: markHeight, color, opacity: overlay.type === "highlight" ? 0.35 : 1 });
}

function stampAnchor(page, position, width, height) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const right = pageWidth - width - 28;
  const top = pageHeight - height - 28;
  if (position === "top-right") return { x: right, y: top };
  if (position === "bottom-left") return { x: 28, y: 28 };
  if (position === "bottom-right") return { x: right, y: 28 };
  return { x: 28, y: top };
}

async function applyStamps(output) {
  const hasText = state.stamp.dateEnabled || state.stamp.customText;
  if (!hasText && !state.stamp.signature) return;
  const font = await output.embedFont(PDFLib.StandardFonts.HelveticaBold);
  let signature;
  if (state.stamp.signature) signature = state.stamp.signature.type === "image/png" ? await output.embedPng(state.stamp.signature.bytes) : await output.embedJpg(state.stamp.signature.bytes);
  const stampDate = state.stamp.dateValue || new Date().toISOString().slice(0, 10);
  output.getPages().forEach((page) => {
    let verticalOffset = 0;
    if (hasText) {
      const label = [state.stamp.customText, state.stamp.dateEnabled ? stampDate : ""].filter(Boolean).join(" · ");
      const textSize = 9;
      const textWidth = font.widthOfTextAtSize(label, textSize);
      const boxWidth = textWidth + 18;
      const boxHeight = 25;
      const anchor = stampAnchor(page, state.stamp.position, boxWidth, boxHeight);
      page.drawRectangle({ x: anchor.x, y: anchor.y, width: boxWidth, height: boxHeight, color: PDFLib.rgb(0.08, 0.37, 0.39), opacity: 0.9, borderColor: PDFLib.rgb(0.04, 0.22, 0.24), borderWidth: 1 });
      page.drawText(label, { x: anchor.x + 9, y: anchor.y + 8, size: textSize, font, color: PDFLib.rgb(1, 1, 1) });
      verticalOffset = boxHeight + 8;
    }
    if (signature) {
      const scaled = signature.scaleToFit(110, 55);
      const anchor = stampAnchor(page, state.stamp.position, scaled.width, scaled.height + verticalOffset);
      page.drawImage(signature, { x: anchor.x, y: anchor.y + verticalOffset, width: scaled.width, height: scaled.height, opacity: 0.95 });
    }
  });
}

async function addFiles(files) {
  const pdfs = [...files].filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) { setStatus("Choose PDF files only."); return; }
  try {
    setStatus("Reading PDFs locally and preparing the page list…");
    for (const file of pdfs) {
      const source = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      const documentItem = { id: makeId("document"), file, pageCount: source.getPageCount() };
      state.documents.push(documentItem); state.pdfCache.set(documentItem.id, source);
      source.getPageIndices().forEach((sourcePage) => state.pages.push({ id: makeId("page"), type: "source", documentId: documentItem.id, sourcePage, rotation: 0, selected: false, cropMargin: 0 }));
    }
    render(); setStatus(`${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"} added locally. Arrange individual pages, then export.`);
  } catch (error) { console.error(error); setStatus("One or more PDFs could not be opened. Try standard, non-password-protected PDF files."); }
}

async function buildWorkingPdf(pagePlan) {
  const output = await PDFLib.PDFDocument.create();
  for (const item of pagePlan) {
    let page;
    if (item.type === "blank") page = output.addPage([item.width, item.height]);
    else {
      const source = state.pdfCache.get(item.documentId);
      [page] = await output.copyPages(source, [item.sourcePage]);
      output.addPage(page);
    }
    if (item.rotation) page.setRotation(PDFLib.degrees(item.rotation));
    if (item.cropMargin) {
      const { width, height } = page.getSize();
      const margin = Math.min(item.cropMargin, Math.max(4, Math.min(width, height) / 3));
      page.setCropBox(margin, margin, width - margin * 2, height - margin * 2);
    }
  }
  await applyEdits(output);
  output.getPages().forEach((page, index) => state.edit.overlays.filter((overlay) => overlay.pageId === pagePlan[index]?.id).forEach((overlay) => drawOverlay(page, overlay)));
  await applyStamps(output);
  applyDocumentDetails(output);
  return output.save({ useObjectStreams: state.finish.optimise });
}

async function loadPdfRenderer() {
  const renderer = await import("../vendor/pdf.min.mjs");
  renderer.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.mjs";
  return renderer;
}

async function buildSecureRedactedPdf(workingBytes, pagePlan) {
  const renderer = await loadPdfRenderer();
  const loadingTask = renderer.getDocument({ data: workingBytes });
  const source = await loadingTask.promise;
  const flattened = await PDFLib.PDFDocument.create();
  try {
    for (let index = 1; index <= source.numPages; index += 1) {
      setStatus(`Securely flattening page ${index} of ${source.numPages} locally…`);
      const sourcePage = await source.getPage(index);
      const viewport = sourcePage.getViewport({ scale: 1.35 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      await sourcePage.render({ canvasContext: context, viewport }).promise;
      state.edit.redactions.filter((item) => item.pageId === pagePlan[index - 1]?.id).forEach((item) => {
        context.fillStyle = "#000000";
        context.fillRect(canvas.width * item.x / 100, canvas.height * item.y / 100, canvas.width * item.width / 100, canvas.height * item.height / 100);
      });
      const pngBytes = await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer();
      const image = await flattened.embedPng(pngBytes);
      const originalSize = sourcePage.getViewport({ scale: 1 });
      const page = flattened.addPage([originalSize.width, originalSize.height]);
      page.drawImage(image, { x: 0, y: 0, width: originalSize.width, height: originalSize.height });
    }
  } finally { await loadingTask.destroy(); }
  return flattened.save({ useObjectStreams: state.finish.optimise });
}

async function buildPdf(pagePlan) {
  const workingBytes = await buildWorkingPdf(pagePlan);
  return state.edit.redactions.length ? buildSecureRedactedPdf(workingBytes, pagePlan) : workingBytes;
}

function downloadPdf(bytes, filename, inputBytes = state.documents.reduce((total, item) => total + item.file.size, 0)) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  $("output-size").textContent = formatBytes(bytes.length);
  if (inputBytes) {
    const difference = bytes.length - inputBytes;
    $("size-change").textContent = `${formatDifference(difference)} (${difference <= 0 ? "smaller" : "larger"} than selected sources)`;
  }
}

function safeExportName() {
  const clean = state.finish.exportName.trim().replace(/[^a-z0-9 _.-]/gi, "").replace(/\.pdf$/i, "");
  return `${clean || "pdf-studio-organised"}.pdf`;
}

async function mergeAndDownload() {
  if (!state.pages.length) return;
  try { $("merge-files").disabled = true; setStatus("Creating your PDF locally. This may take a moment for large files."); const filename = safeExportName(); downloadPdf(await buildPdf(state.pages), filename); setStatus(`Created a ${state.pages.length}-page PDF locally. Check ${filename} in your downloads.`); }
  catch (error) { console.error(error); setStatus("The PDF could not be created. Try standard, non-password-protected PDF files."); }
  finally { $("merge-files").disabled = state.pages.length === 0; }
}

async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = reject; image.src = url;
    });
    return { file, bytes: await file.arrayBuffer(), type: file.type, ...dimensions };
  } finally { URL.revokeObjectURL(url); }
}

async function addImages(files) {
  const images = [...files].filter((file) => ["image/png", "image/jpeg"].includes(file.type));
  if (!images.length) { setStatus("Choose PNG or JPEG images only."); return; }
  try {
    setStatus("Reading images locally…");
    for (const file of images) state.converter.images.push(await readImage(file));
    render(); setStatus(`${images.length} image${images.length === 1 ? "" : "s"} ready to convert locally.`);
  } catch (error) { console.error(error); setStatus("One or more images could not be read."); }
}

async function createImagePdf() {
  if (!state.converter.images.length) return;
  try {
    $("create-image-pdf").disabled = true; setStatus("Creating an A4 PDF from your local images…");
    const output = await PDFLib.PDFDocument.create();
    for (const item of state.converter.images) {
      const image = item.type === "image/png" ? await output.embedPng(item.bytes) : await output.embedJpg(item.bytes);
      const page = output.addPage([595.28, 841.89]);
      const scaled = image.scaleToFit(page.getWidth() - 48, page.getHeight() - 48);
      page.drawImage(image, { x: (page.getWidth() - scaled.width) / 2, y: (page.getHeight() - scaled.height) / 2, width: scaled.width, height: scaled.height });
    }
    const bytes = await output.save({ useObjectStreams: state.finish.optimise });
    downloadPdf(bytes, "pdf-studio-images-to-pdf.pdf", state.converter.images.reduce((total, item) => total + item.file.size, 0));
    setStatus(`Created a ${state.converter.images.length}-page image PDF locally. Check your downloads.`);
  } catch (error) { console.error(error); setStatus("The image PDF could not be created."); }
  finally { $("create-image-pdf").disabled = state.converter.images.length === 0; }
}

function renderComparison(rows) {
  const result = $("compare-result"); result.replaceChildren();
  rows.forEach(({ label, value }) => {
    const card = document.createElement("div");
    const name = document.createElement("span"); name.textContent = label;
    const detail = document.createElement("strong"); detail.textContent = value;
    card.append(name, detail); result.append(card);
  });
}

async function comparePdfs() {
  const { compareFirst: first, compareSecond: second } = state.finish;
  if (!first || !second) return;
  try {
    setStatus("Reading both PDFs locally for comparison…");
    const [firstPdf, secondPdf] = await Promise.all([PDFLib.PDFDocument.load(await first.arrayBuffer()), PDFLib.PDFDocument.load(await second.arrayBuffer())]);
    const sameBytes = first.size === second.size && first.name === second.name;
    renderComparison([
      { label: "First PDF", value: `${first.name} · ${firstPdf.getPageCount()} pages · ${formatBytes(first.size)}` },
      { label: "Second PDF", value: `${second.name} · ${secondPdf.getPageCount()} pages · ${formatBytes(second.size)}` },
      { label: "Page-count check", value: firstPdf.getPageCount() === secondPdf.getPageCount() ? "Same number of pages" : "Different number of pages" },
      { label: "File check", value: sameBytes ? "Same filename and size" : "Different filename or file size" },
      { label: "Titles", value: `${firstPdf.getTitle() || "No title"} / ${secondPdf.getTitle() || "No title"}` }
    ]);
    setStatus("PDF comparison completed locally.");
  } catch (error) { console.error(error); setStatus("The two PDFs could not be compared. Try standard, non-password-protected PDF files."); }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderFormFields() {
  const container = $("form-fields"); container.replaceChildren();
  if (!state.form.fields.length) { container.innerHTML = '<p class="empty">No fillable fields detected in this PDF.</p>'; return; }
  state.form.fields.forEach((item) => {
    const label = document.createElement("label"); label.textContent = item.name;
    const input = document.createElement("input");
    if (item.kind === "check") { input.type = "checkbox"; input.checked = item.value; label.className = "toggle-field"; label.prepend(input); }
    else { input.type = "text"; input.value = item.value || ""; }
    input.addEventListener("input", () => { item.value = input.type === "checkbox" ? input.checked : input.value; });
    label.append(input); container.append(label);
  });
}

async function loadFillableForm(file) {
  if (!file) return;
  try {
    setStatus("Reading fillable fields locally…");
    const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const form = pdf.getForm();
    state.form.pdf = pdf;
    state.form.fields = form.getFields().map((field) => {
      const kind = field instanceof PDFLib.PDFCheckBox ? "check" : "text";
      let value = "";
      try { value = kind === "check" ? field.isChecked() : (field.getText?.() || ""); } catch { value = ""; }
      return { field, name: field.getName(), kind, value };
    });
    render(); renderFormFields(); setStatus(`${state.form.fields.length} fillable field${state.form.fields.length === 1 ? "" : "s"} detected locally.`);
  } catch (error) { console.error(error); state.form = { pdf: null, fields: [] }; render(); renderFormFields(); setStatus("This PDF could not be opened as a fillable form."); }
}

async function saveFilledForm() {
  if (!state.form.pdf) return;
  try {
    state.form.fields.forEach((item) => {
      if (item.kind === "check") { if (item.value) item.field.check(); else item.field.uncheck(); }
      else if (item.field.setText) item.field.setText(item.value || "");
    });
    const bytes = await state.form.pdf.save({ useObjectStreams: state.finish.optimise });
    downloadPdf(bytes, "pdf-studio-filled-form.pdf"); setStatus("Filled PDF form saved locally.");
  } catch (error) { console.error(error); setStatus("The filled form could not be saved."); }
}

async function extractTextFromPdf() {
  if (!state.converter.textPdf) return;
  try {
    setStatus("Extracting text locally…");
    const renderer = await loadPdfRenderer();
    const task = renderer.getDocument({ data: await state.converter.textPdf.arrayBuffer() });
    const pdf = await task.promise; const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pages.push(`--- Page ${pageNumber} ---\n${content.items.map((item) => item.str).join(" ")}`);
    }
    await task.destroy(); downloadBlob(new Blob([pages.join("\n\n")], { type: "text/plain" }), "pdf-studio-extracted-text.txt"); setStatus("PDF text extracted locally.");
  } catch (error) { console.error(error); setStatus("Text could not be extracted from this PDF."); }
}

async function renderPdfImages() {
  if (!state.converter.imagePdf) return;
  try {
    setStatus("Rendering PDF pages locally…");
    const renderer = await loadPdfRenderer();
    const task = renderer.getDocument({ data: await state.converter.imagePdf.arrayBuffer() });
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) downloadBlob(blob, `pdf-studio-page-${String(pageNumber).padStart(2, "0")}.png`);
    }
    await task.destroy(); setStatus(`Rendered ${pdf.numPages} PDF page${pdf.numPages === 1 ? "" : "s"} locally. Check your downloads.`);
  } catch (error) { console.error(error); setStatus("Page images could not be created from this PDF."); }
}

async function extractSelected() {
  const pages = selectedPages(); if (!pages.length) return;
  try { setStatus("Extracting selected pages locally…"); downloadPdf(await buildPdf(pages), "pdf-studio-extracted-pages.pdf"); setStatus(`Extracted ${pages.length} page${pages.length === 1 ? "" : "s"} locally.`); }
  catch (error) { console.error(error); setStatus("The selected pages could not be extracted."); }
}

async function splitSelected() {
  const splitStarts = state.pages.map((page, index) => page.selected && index > 0 ? index : -1).filter((index) => index >= 0);
  if (!splitStarts.length) { setStatus("For a split, tick the page that should begin the second (or later) PDF."); return; }
  try {
    setStatus("Creating split PDFs locally…");
    const boundaries = [0, ...splitStarts, state.pages.length];
    for (let index = 0; index < boundaries.length - 1; index += 1) downloadPdf(await buildPdf(state.pages.slice(boundaries[index], boundaries[index + 1])), `pdf-studio-part-${String(index + 1).padStart(2, "0")}.pdf`);
    setStatus(`Created ${boundaries.length - 1} split PDFs locally. Check your downloads.`);
  } catch (error) { console.error(error); setStatus("The PDFs could not be split."); }
}

function insertBlankAfterSelected() {
  const nextPlan = [];
  state.pages.forEach((page) => { nextPlan.push(page); if (page.selected) nextPlan.push(blankPage()); });
  state.pages = nextPlan; render(); setStatus("Blank A4 pages inserted after the selected pages in the export plan.");
}

function cropSelected() {
  const margin = Number($("crop-margin").value);
  if (!Number.isFinite(margin) || margin < 4) { setStatus("Enter a crop margin of at least 4 points."); return; }
  selectedPages().forEach((page) => { page.cropMargin = margin; });
  render(); setStatus(`Selected pages will be cropped by ${margin} points on every edge in the exported PDF.`);
}

function overlayNumber(id) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : 0;
}

function addOverlay() {
  const selected = selectedPages();
  if (!selected.length) { setStatus("Tick one or more pages before adding a mark."); return; }
  const base = { type: $("overlay-type").value, colour: $("overlay-colour").value, x: overlayNumber("overlay-x"), y: overlayNumber("overlay-y"), width: overlayNumber("overlay-width"), height: overlayNumber("overlay-height") };
  if (base.x < 0 || base.y < 0 || base.width < 1 || base.height < 1) { setStatus("Enter valid mark coordinates."); return; }
  selected.forEach((page) => state.edit.overlays.push({ id: makeId("overlay"), pageId: page.id, ...base }));
  render(); setStatus(`${base.type === "whiteout" ? "Whiteout" : "Mark"} added to ${selected.length} selected page${selected.length === 1 ? "" : "s"} in the export plan.`);
}

function addRedaction() {
  const selected = selectedPages();
  const base = { x: overlayNumber("redact-x"), y: overlayNumber("redact-y"), width: overlayNumber("redact-width"), height: overlayNumber("redact-height") };
  if (!selected.length || base.x < 0 || base.y < 0 || base.width < 1 || base.height < 1) { setStatus("Tick page(s) and enter valid redaction coordinates."); return; }
  selected.forEach((page) => state.edit.redactions.push({ id: makeId("redaction"), pageId: page.id, ...base }));
  render(); setStatus(`Secure redaction queued for ${selected.length} page${selected.length === 1 ? "" : "s"}. Export will create a flattened non-searchable PDF.`);
}

$("pdf-input").addEventListener("change", (event) => { addFiles(event.target.files); event.target.value = ""; });
$("clear-files").addEventListener("click", () => { state.documents = []; state.pages = []; state.pdfCache.clear(); render(); setStatus("Local PDF list cleared."); });
$("merge-files").addEventListener("click", mergeAndDownload);
$("extract-selected").addEventListener("click", extractSelected);
$("split-selected").addEventListener("click", splitSelected);
$("blank-after-selected").addEventListener("click", insertBlankAfterSelected);
$("crop-selected").addEventListener("click", cropSelected);
$("add-overlay").addEventListener("click", addOverlay);
$("clear-overlays").addEventListener("click", () => { state.edit.overlays = []; render(); setStatus("All drawing marks cleared from the export plan."); });
$("add-redaction").addEventListener("click", addRedaction);
$("clear-redactions").addEventListener("click", () => { state.edit.redactions = []; render(); setStatus("All secure redactions cleared from the export plan."); });
$("page-numbers").addEventListener("change", (event) => { state.edit.pageNumbers = event.target.checked; updateEditSummary(); });
$("page-number-position").addEventListener("change", (event) => { state.edit.pageNumberPosition = event.target.value; });
$("watermark-text").addEventListener("input", (event) => { state.edit.watermark = event.target.value.trim(); updateEditSummary(); });
$("watermark-opacity").addEventListener("input", (event) => { state.edit.watermarkOpacity = Number(event.target.value); });
$("note-text").addEventListener("input", (event) => { state.edit.note = event.target.value.trim(); updateEditSummary(); });
$("image-stamp").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) { state.edit.image = null; updateEditSummary(); return; }
  if (!["image/png", "image/jpeg"].includes(file.type)) { setStatus("Choose a PNG or JPEG image stamp."); event.target.value = ""; return; }
  state.edit.image = { bytes: await file.arrayBuffer(), type: file.type, name: file.name };
  updateEditSummary(); setStatus(`${file.name} will be added as an image stamp to the exported copy.`);
});
$("date-stamp-enabled").addEventListener("change", (event) => { state.stamp.dateEnabled = event.target.checked; updateStampSummary(); });
$("date-stamp-value").addEventListener("change", (event) => { state.stamp.dateValue = event.target.value; updateStampSummary(); });
$("custom-stamp-text").addEventListener("input", (event) => { state.stamp.customText = event.target.value.trim(); updateStampSummary(); });
$("stamp-position").addEventListener("change", (event) => { state.stamp.position = event.target.value; });
$("signature-stamp").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) { state.stamp.signature = null; updateStampSummary(); return; }
  if (!["image/png", "image/jpeg"].includes(file.type)) { setStatus("Choose a PNG or JPEG signature image."); event.target.value = ""; return; }
  state.stamp.signature = { bytes: await file.arrayBuffer(), type: file.type, name: file.name };
  updateStampSummary(); setStatus(`${file.name} will be added as a signature stamp to the exported copy.`);
});
$("optimise-export").addEventListener("change", (event) => { state.finish.optimise = event.target.checked; updateFinishSummary(); });
$("export-name").addEventListener("input", (event) => { state.finish.exportName = event.target.value; });
$("add-details").addEventListener("change", (event) => { state.finish.addDetails = event.target.checked; if (event.target.checked) { state.finish.removeDetails = false; $("remove-details").checked = false; } updateDetailsSummary(); });
$("remove-details").addEventListener("change", (event) => { state.finish.removeDetails = event.target.checked; if (event.target.checked) { state.finish.addDetails = false; $("add-details").checked = false; } updateDetailsSummary(); });
$("detail-title").addEventListener("input", (event) => { state.finish.title = event.target.value.trim(); });
$("detail-author").addEventListener("input", (event) => { state.finish.author = event.target.value.trim(); });
$("detail-subject").addEventListener("input", (event) => { state.finish.subject = event.target.value.trim(); });
$("compare-first").addEventListener("change", (event) => { [state.finish.compareFirst] = event.target.files; updateActions(); });
$("compare-second").addEventListener("change", (event) => { [state.finish.compareSecond] = event.target.files; updateActions(); });
$("compare-pdfs").addEventListener("click", comparePdfs);
$("image-to-pdf-input").addEventListener("change", (event) => { addImages(event.target.files); event.target.value = ""; });
$("clear-images").addEventListener("click", () => { state.converter.images = []; render(); setStatus("Local image list cleared."); });
$("create-image-pdf").addEventListener("click", createImagePdf);
$("form-input").addEventListener("change", (event) => loadFillableForm(event.target.files[0]));
$("save-filled-form").addEventListener("click", saveFilledForm);
$("pdf-to-text-input").addEventListener("change", (event) => { [state.converter.textPdf] = event.target.files; updateActions(); });
$("pdf-to-images-input").addEventListener("change", (event) => { [state.converter.imagePdf] = event.target.files; updateActions(); });
$("export-text").addEventListener("click", extractTextFromPdf);
$("export-images").addEventListener("click", renderPdfImages);

const zone = $("drop-zone");
["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add("dragover"); }));
["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.remove("dragover"); }));
zone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

render();
updateEditSummary();
updateStampSummary();
updateFinishSummary();
updateDetailsSummary();

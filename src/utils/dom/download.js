export function triggerFileDownload(href, filename) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadBlob(blob, filename, { revokeDelay = 1000 } = {}) {
  const url = URL.createObjectURL(blob);
  triggerFileDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), revokeDelay);
}

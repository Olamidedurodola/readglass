export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(max-width: 768px)").matches;
}

export function canInstallPwa() {
  return "serviceWorker" in navigator && (isAndroid() || /Chrome/i.test(navigator.userAgent));
}

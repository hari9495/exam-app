import '@testing-library/jest-dom';

// Polyfill for hasPointerCapture - needed for Radix UI components in jsdom
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

// Polyfill for scrollIntoView - needed for Radix UI Select in jsdom
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

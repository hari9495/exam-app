// Prudent's monogram mark, rendered with currentColor so the same markup
// works in white (on navy) or navy (on white) contexts without a raster asset.
export function PrudentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="35 223 100 148" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M102.55,229.37c15.22,0,27.57,22.19,27.57,49.56s-12.34,49.56-27.57,49.56c-8.46,0-16.03-6.86-21.09-17.66,3.61,4.53,8.01,7.19,12.77,7.19,12.2,0,22.09-17.5,22.09-39.09s-9.89-39.09-22.09-39.09c-4.76,0-9.16,2.66-12.77,7.19,5.06-10.8,12.63-17.66,21.09-17.66"
      />
      <path
        fillRule="evenodd"
        d="M74.55,259.89c-3.26,57.18,10.02,92.47,38.7,106.01h-34.47c-16.27-31.23-18.24-66.37-4.23-106.01"
      />
      <path
        fillRule="evenodd"
        d="M61.99,289.99c-1.81,32.09,1.3,61.11,11.57,75.92h-19.97c-5.74-30.66-1.62-55.48,8.41-75.92"
      />
      <path
        fillRule="evenodd"
        d="M48.37,321.78c-1.04,17.49-1.25,33.46,1.02,44.12h-10.94c.04-15.95,2.29-31.1,9.93-44.12"
      />
    </svg>
  );
}

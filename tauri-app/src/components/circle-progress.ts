export function createCircleProgress(
  percentage: number,
  size: number = 32
): string {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  const center = size / 2;

  const color = getColor(percentage);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="circle-progress">
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="rgba(255,255,255,0.1)"
        stroke-width="${strokeWidth}"
      />
      <circle
        cx="${center}" cy="${center}" r="${radius}"
        fill="none" stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
        stroke-linecap="round"
        transform="rotate(-90 ${center} ${center})"
      />
    </svg>
  `;
}

export function getColor(percentage: number): string {
  if (percentage >= 80) return "#ff4444";
  if (percentage >= 50) return "#ffaa00";
  return "#44cc44";
}

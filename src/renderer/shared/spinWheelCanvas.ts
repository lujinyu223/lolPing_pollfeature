import type { SpinChoice } from '../../shared/spinWheel';

const wheelColors = ['#d85c48', '#3b9c9b', '#e3b341', '#5578a8', '#71a45b', '#b5688c', '#d3813b', '#6c70ad'];

export function drawSpinWheel(canvas: HTMLCanvasElement, choices: readonly SpinChoice[]): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const center = canvas.width / 2;
  const radius = center - 5;
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  let start = -Math.PI / 2;
  for (const [index, choice] of choices.entries()) {
    const end = start + (choice.weight / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = wheelColors[index % wheelColors.length];
    context.fill();
    context.strokeStyle = '#10181b';
    context.lineWidth = 3;
    context.stroke();
    if (end - start > 0.18) {
      const middle = (start + end) / 2;
      context.save();
      context.translate(center + Math.cos(middle) * radius * 0.58, center + Math.sin(middle) * radius * 0.58);
      context.rotate(middle + Math.PI / 2);
      context.fillStyle = '#fff4d3';
      context.font = '600 15px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText([...choice.label].slice(0, 14).join(''), 0, 0, radius * 0.55);
      context.restore();
    }
    start = end;
  }
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = '#e3c677';
  context.lineWidth = 5;
  context.stroke();
}

export function makeWheelCanvas(choices: readonly SpinChoice[], className = 'spin-wheel'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.width = 400;
  canvas.height = 400;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', choices.map((choice) => choice.label).join(', '));
  drawSpinWheel(canvas, choices);
  return canvas;
}
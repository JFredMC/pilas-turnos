import { Component, computed, input } from '@angular/core';

/** Patrón tipo QR puramente decorativo: NO es un QR real de Nequi. */
@Component({
  selector: 'app-qr-simulado',
  template: `
    <svg
      viewBox="0 0 25 25"
      width="168"
      height="168"
      role="img"
      [attr.aria-label]="'Código QR simulado para abonar ' + etiqueta()"
    >
      <rect width="25" height="25" fill="#fff" />
      @for (c of celdas(); track $index) {
        <rect [attr.x]="c[0]" [attr.y]="c[1]" width="1" height="1" fill="#1b1030" />
      }
    </svg>
  `,
})
export class QrSimulado {
  readonly semilla = input('pilas');
  readonly etiqueta = input('');
  readonly celdas = computed(() => {
    let h = 0;
    for (const ch of this.semilla()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out: [number, number][] = [];
    const ojo = (x: number, y: number) =>
      (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < 25; x++) {
        if (ojo(x, y)) {
          const lx = x > 17 ? x - 18 : x,
            ly = y > 17 ? y - 18 : y;
          const borde = lx === 0 || lx === 6 || ly === 0 || ly === 6;
          const centro = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
          if (borde || centro) out.push([x, y]);
          continue;
        }
        h = (h * 1103515245 + 12345) >>> 0;
        if ((h >>> 16) & 1) out.push([x, y]);
      }
    return out;
  });
}

export interface CitaCuadre {
  estilistaId: string;
  precio: number;
}
export interface PagoCuadre {
  estilistaId: string;
  tipo: 'abono' | 'saldo' | 'propina';
  medio: 'efectivo' | 'nequi';
  monto: number;
}
export interface EstilistaCuadre {
  id: string;
  nombre: string;
  comisionPct: number;
}

export interface FilaCuadre {
  estilistaId: string;
  nombre: string;
  comisionPct: number;
  servicios: number;
  ventas: number;
  comision: number;
  propinas: number;
  efectivo: number;
  nequi: number;
  aPagar: number;
}

/** Cuadre de caja del día por estilista: citas atendidas + pagos confirmados. Función pura. */
export function calcularCuadre(
  est: EstilistaCuadre[],
  citas: CitaCuadre[],
  pagos: PagoCuadre[],
): FilaCuadre[] {
  return est.map((e) => {
    const cs = citas.filter((c) => c.estilistaId === e.id);
    const ps = pagos.filter((p) => p.estilistaId === e.id);
    const ventas = cs.reduce((a, c) => a + c.precio, 0);
    const comision = Math.round((ventas * e.comisionPct) / 100);
    const propinas = ps.filter((p) => p.tipo === 'propina').reduce((a, p) => a + p.monto, 0);
    const por = (m: 'efectivo' | 'nequi') =>
      ps.filter((p) => p.medio === m).reduce((a, p) => a + p.monto, 0);
    return {
      estilistaId: e.id,
      nombre: e.nombre,
      comisionPct: e.comisionPct,
      servicios: cs.length,
      ventas,
      comision,
      propinas,
      efectivo: por('efectivo'),
      nequi: por('nequi'),
      aPagar: comision + propinas,
    };
  });
}

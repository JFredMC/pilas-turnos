# Pilas · Turnos para peluquerías

App de turnos pensada para peluquerías y barberías de Turbo, Antioquia: la clienta separa su turno desde un enlace de WhatsApp sin crear cuenta, y el salón maneja agenda por estilista, lista de espera y cuadre de caja diario.

**Vista previa:** https://jfredmc.github.io/pilas-turnos/

> Prototipo con **datos de ejemplo** y sin backend: todo vive en memoria y se reinicia al recargar. El QR de Nequi es simulado.

## Pantallas

- **Reserva (clienta):** servicio → estilista → horario → datos → confirmación con abono por QR Nequi (simulado) y botón para compartir por WhatsApp.
- **Agenda del salón:** citas del día por estilista con estados (pendiente, confirmada, atendida, no llegó).
- **Lista de espera:** avisar por WhatsApp con un toque cuando se libera un cupo.
- **Cuadre de caja:** ventas, comisiones, propinas, efectivo y Nequi por estilista.

Modo claro/oscuro de un toque (se recuerda), menú móvil, PWA instalable.

## Desarrollo

```bash
pnpm install
pnpm start        # http://localhost:4200
pnpm test         # Vitest
pnpm build:pages  # build para GitHub Pages
```

Stack: Angular (standalone, signals), Vitest, pnpm, GitHub Actions y GitHub Pages.

Autor: Jhon Maquilon ([@JFredMC](https://github.com/JFredMC)) · Licencia MIT.

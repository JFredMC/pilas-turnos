import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TurnosStore } from '../core/turnos.store';

@Component({
  selector: 'app-ingresar',
  imports: [FormsModule],
  template: `
    <h1>Ingresar al salón</h1>
    <p class="muted">Para la dueña y las estilistas.</p>
    <form class="card form" (ngSubmit)="entrar()">
      <label for="email">Correo</label>
      <input
        id="email"
        name="email"
        type="email"
        [(ngModel)]="email"
        required
        autocomplete="username"
      />
      <label for="clave">Contraseña</label>
      <input
        id="clave"
        name="clave"
        type="password"
        [(ngModel)]="clave"
        required
        autocomplete="current-password"
      />
      <button class="btn" type="submit" [disabled]="cargando() || !email || !clave">
        Ingresar
      </button>
    </form>
    @if (store.error()) {
      <p class="aviso" role="alert">{{ store.error() }}</p>
    }
  `,
})
export class Ingresar {
  protected readonly store = inject(TurnosStore);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  protected email = '';
  protected clave = '';
  protected readonly cargando = signal(false);

  async entrar() {
    this.cargando.set(true);
    const ok = await this.store.ingresar(this.email.trim(), this.clave);
    this.cargando.set(false);
    this.clave = '';
    if (ok) {
      const volver = this.ruta.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(volver?.startsWith('/salon/') ? volver : '/salon/agenda');
    }
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TurnosStore } from '../core/turnos.store';

/** Cambio de contraseña (obligatorio si la dueña dio una temporal). */
@Component({
  selector: 'app-cambiar-clave',
  imports: [FormsModule],
  template: `
    <h1>Cambia tu contraseña</h1>
    <p class="muted">Por seguridad, crea una contraseña propia de al menos 10 caracteres.</p>
    <form class="card form" (ngSubmit)="guardar()">
      <label for="c-a">Contraseña actual o temporal</label>
      <input
        id="c-a"
        name="a"
        type="password"
        [(ngModel)]="actual"
        required
        autocomplete="current-password"
      />
      <label for="c-n">Contraseña nueva</label>
      <input
        id="c-n"
        name="n"
        type="password"
        [(ngModel)]="nueva"
        required
        minlength="10"
        autocomplete="new-password"
      />
      <label for="c-r">Repite la contraseña nueva</label>
      <input
        id="c-r"
        name="r"
        type="password"
        [(ngModel)]="repetir"
        required
        autocomplete="new-password"
      />
      @if (nueva && repetir && nueva !== repetir) {
        <p class="aviso" role="alert">Las contraseñas no coinciden.</p>
      }
      <button
        class="btn"
        type="submit"
        [disabled]="cargando() || nueva.length < 10 || nueva !== repetir"
      >
        Guardar contraseña
      </button>
    </form>
    @if (store.error()) {
      <p class="aviso" role="alert">{{ store.error() }}</p>
    }
  `,
})
export class CambiarClave {
  protected readonly store = inject(TurnosStore);
  private readonly router = inject(Router);
  protected actual = '';
  protected nueva = '';
  protected repetir = '';
  protected readonly cargando = signal(false);
  async guardar() {
    this.cargando.set(true);
    const ok = await this.store.cambiarClave(this.actual, this.nueva);
    this.cargando.set(false);
    this.actual = this.nueva = this.repetir = '';
    if (ok) await this.router.navigateByUrl('/salon/agenda');
  }
}

@Component({
  selector: 'app-recuperar',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Recuperar contraseña</h1>
    @if (mensaje()) {
      <div class="card ok" role="status">
        <p>{{ mensaje() }}</p>
        <p class="muted">Revisa también la carpeta de spam. El enlace vale 1 hora.</p>
      </div>
      <a routerLink="/salon/ingresar">Volver a ingresar</a>
    } @else {
      <p class="muted">
        Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.
      </p>
      <form class="card form" (ngSubmit)="enviar()">
        <label for="r-e">Correo</label>
        <input
          id="r-e"
          name="e"
          type="email"
          [(ngModel)]="email"
          required
          autocomplete="username"
        />
        <button class="btn" type="submit" [disabled]="cargando() || !email">Enviar enlace</button>
      </form>
      @if (store.error()) {
        <p class="aviso" role="alert">{{ store.error() }}</p>
      }
      <a routerLink="/salon/ingresar">Volver a ingresar</a>
    }
  `,
})
export class Recuperar {
  protected readonly store = inject(TurnosStore);
  protected email = '';
  protected readonly cargando = signal(false);
  protected readonly mensaje = signal<string | null>(null);
  async enviar() {
    this.cargando.set(true);
    this.mensaje.set(await this.store.pedirRecuperacion(this.email.trim()));
    this.cargando.set(false);
  }
}

@Component({
  selector: 'app-restablecer',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Crea tu contraseña nueva</h1>
    @if (listo()) {
      <div class="card ok" role="status">
        <p>¡Listo! Ya puedes ingresar con tu contraseña nueva.</p>
      </div>
      <a class="btn" routerLink="/salon/ingresar">Ingresar</a>
    } @else if (!token) {
      <p class="aviso" role="alert">El enlace está incompleto. Pide uno nuevo.</p>
      <a routerLink="/salon/recuperar">Pedir otro enlace</a>
    } @else {
      <form class="card form" (ngSubmit)="guardar()">
        <label for="n-n">Contraseña nueva</label>
        <input
          id="n-n"
          name="n"
          type="password"
          [(ngModel)]="nueva"
          required
          minlength="10"
          autocomplete="new-password"
        />
        <label for="n-r">Repítela</label>
        <input
          id="n-r"
          name="r"
          type="password"
          [(ngModel)]="repetir"
          required
          autocomplete="new-password"
        />
        <button
          class="btn"
          type="submit"
          [disabled]="cargando() || nueva.length < 10 || nueva !== repetir"
        >
          Guardar
        </button>
      </form>
      @if (store.error()) {
        <p class="aviso" role="alert">
          {{ store.error() }} <a routerLink="/salon/recuperar">Pedir otro enlace</a>
        </p>
      }
    }
  `,
})
export class Restablecer {
  protected readonly store = inject(TurnosStore);
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  protected nueva = '';
  protected repetir = '';
  protected readonly cargando = signal(false);
  protected readonly listo = signal(false);
  async guardar() {
    this.cargando.set(true);
    const ok = await this.store.restablecer(this.token, this.nueva);
    this.cargando.set(false);
    this.nueva = this.repetir = '';
    if (ok) {
      this.listo.set(true);
      // Quita el token de la barra de direcciones.
      history.replaceState(null, '', location.pathname);
    }
  }
}

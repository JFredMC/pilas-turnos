import { expect, test } from '@playwright/test';

test.describe('reserva de la clienta (datos de ejemplo)', () => {
  test('separa un turno con abono y ve el QR simulado', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Separa tu turno' })).toBeVisible();
    await page.locator('button.opcion').first().click();
    await expect(page.getByRole('heading', { name: '2. ¿Con quién?' })).toBeVisible();
    await page.locator('button.opcion').first().click();
    await expect(page.getByRole('heading', { name: /3\. Escoge el día/ })).toBeVisible();

    // Busca el primer día con cupos (hoy puede estar lleno o cerrado).
    const dias = page.locator('button[aria-pressed]');
    const n = await dias.count();
    for (let i = 0; i < n; i++) {
      await dias.nth(i).click();
      if (await page.locator('button.chip').count()) break;
    }
    await page.locator('button.chip').first().click();

    await page.getByLabel('Tu nombre').fill('Daniela');
    await page.getByLabel('Celular (WhatsApp)').fill('3001234567');
    await page.getByRole('checkbox', { name: /Abonar/ }).check();
    await page.getByRole('checkbox', { name: /Autorizo/ }).check();
    await page.getByRole('button', { name: 'Confirmar turno' }).click();

    await expect(page.getByText('¡Quedó separado!')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Daniela, te esperamos/ })).toBeVisible();
    await expect(page.getByText(/Simulación: este QR es de ejemplo/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Compartir por WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\//,
    );
  });
});

test.describe('panel del salón (datos de ejemplo)', () => {
  test('agenda de hoy con estilistas y cambio de día', async ({ page }) => {
    await page.goto('salon/agenda');
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Todas' })).toBeVisible();
    await expect(page.locator('li.cita').first()).toBeVisible();

    await page.getByRole('button', { name: 'Día siguiente' }).click();
    await expect(page.getByText('Los datos de ejemplo son solo de hoy.')).toBeVisible();
    await expect(page.locator('li.cita')).toHaveCount(0);
    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.locator('li.cita').first()).toBeVisible();
  });

  test('cuadre de caja', async ({ page }) => {
    await page.goto('salon/caja');
    await expect(page.getByRole('heading', { name: 'Cuadre de caja' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Día' })).toBeVisible();
  });

  test('cambia entre tema claro y oscuro', async ({ page }) => {
    await page.goto('./');
    const html = page.locator('html');
    const antes = await html.getAttribute('data-theme');
    await page
      .getByRole('button', { name: /tema|oscuro|claro/i })
      .first()
      .click();
    await expect(html).not.toHaveAttribute('data-theme', antes ?? '');
  });
});

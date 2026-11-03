import { expect, test, type Page } from '@playwright/test';

async function mockRadar(page: Page, failTiles: () => boolean = () => false) {
  const now = Math.floor(Date.now() / 1_000);
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.route('**/api/v1/weather/radar/frames*', (route) =>
    route.fulfill({
      json: {
        generatedAt: now,
        tileHost: 'https://tilecache.rainviewer.com',
        frames: Array.from({ length: 8 }, (_, index) => ({
          timestamp: now - (7 - index) * 600,
          path: `/v2/radar/frame${index}`,
        })),
      },
    }),
  );
  await page.route('https://tilecache.rainviewer.com/**', (route) =>
    failTiles()
      ? route.fulfill({ status: 429, body: 'Rate limited' })
      : route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=',
            'base64',
          ),
        }),
  );
}

test('plays at most four advances and enforces a tab cooldown', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  const slider = page.getByRole('slider', { name: 'Radar frame time' });
  await expect(slider).toHaveValue('7');
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  await expect(slider).toHaveValue('0');
  await expect(slider).toHaveValue('4', { timeout: 12_000 });
  await expect(page.getByText('Playback complete.')).toBeVisible();
  const play = page.getByRole('button', { name: 'Play radar animation' });
  await expect(play).toBeDisabled();
  await expect(page.getByText(/Fast playback is available again/)).toBeVisible();
  await expect(page.getByText(/Available in \d+s/)).toBeVisible();
  await page.reload();
  await expect(play).toBeDisabled();
  await page.evaluate(() => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + 61_000;
  });
  await expect(play).toBeEnabled({ timeout: 4_000 });
});

test('pauses fast playback when the user zooms the map', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  const play = page.getByRole('button', { name: 'Play radar animation' });
  await expect(play).toBeEnabled();
  await play.click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByText('Playback paused because the map changed.')).toBeVisible();
  await expect(play).toBeDisabled();
});

test('pauses fast playback when the user pans the map', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  const canvas = page.locator('.maplibregl-canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width * 0.7;
  const y = bounds!.y + bounds!.height * 0.32;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Playback paused because the map changed.')).toBeVisible();
});

test('pauses playback when the radar layer changes', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  const layer = page.getByRole('combobox', { name: 'Weather map layer' });
  await layer.selectOption('cities');
  await layer.selectOption('rainviewer');
  await expect(page.getByText('Playback paused because the layer changed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play radar animation' })).toBeDisabled();
});

test('manual frame selection pauses fast playback without bypassing cooldown', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  const slider = page.getByRole('slider', { name: 'Radar frame time' });
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Next radar frame' }).click();
  await expect(slider).toHaveValue('1');
  await expect(page.getByText('Playback paused.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play radar animation' })).toBeDisabled();
});

test('pauses playback when the tab becomes hidden', async ({ page }) => {
  await mockRadar(page);
  await page.goto('/#map');
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Playback paused because the map changed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play radar animation' })).toBeDisabled();
});

test('reports failed radar tiles without claiming successful playback', async ({ page }) => {
  let failTiles = true;
  await mockRadar(page, () => failTiles);
  await page.goto('/#map');
  await expect(page.getByText(/Radar tiles could not be loaded/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play radar animation' })).toBeDisabled();
  failTiles = false;
  await page.getByRole('button', { name: 'Retry radar tiles' }).click();
  await expect(page.getByText(/Retry requested/)).toBeVisible();
});

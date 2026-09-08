import { chromium } from 'playwright';

export const MAX_RECEIPT_BYTES = 1_000_000;

export interface RenderReceiptOptions {
  viewportWidth?: number;
  deviceScaleFactor?: number;
  quality?: number;
}

export interface RenderAttempt {
  quality: number;
  deviceScaleFactor: number;
}

// Degrades quality in 20-point steps down to 40, then starts trimming
// deviceScaleFactor in 0.5 steps (never below 1) — quality first, since it
// costs far less visual fidelity than shrinking the whole image.
function degrade(attempt: RenderAttempt): RenderAttempt {
  if (attempt.quality > 40) {
    return { ...attempt, quality: attempt.quality - 20 };
  }
  return {
    ...attempt,
    deviceScaleFactor: Math.max(1, attempt.deviceScaleFactor - 0.5),
  };
}

/**
 * Renders with `render`, backing off quality/scale until the result fits
 * under `maxBytes`. Kept separate from the Playwright wiring below so the
 * retry policy is testable without a real browser.
 */
export async function fitUnderSizeLimit(
  render: (attempt: RenderAttempt) => Promise<Buffer>,
  start: RenderAttempt,
  maxBytes: number,
  maxAttempts = 4,
): Promise<Buffer> {
  let attempt = start;
  for (let i = 0; i < maxAttempts; i++) {
    const buffer = await render(attempt);
    if (buffer.length <= maxBytes) {
      return buffer;
    }
    if (i === maxAttempts - 1) {
      throw new Error(
        `Could not render the receipt under ${maxBytes} bytes after ${maxAttempts} attempts (last size: ${buffer.length} bytes).`,
      );
    }
    attempt = degrade(attempt);
  }
  /* istanbul ignore next -- unreachable: the loop above always returns or throws */
  throw new Error('unreachable');
}

/**
 * Renders receipt HTML into a JPEG buffer sized for the Point terminal's
 * image print action: a narrow, thermal-receipt-shaped viewport, cropped to
 * the content's real height, and degraded automatically if the first render
 * doesn't fit Mercado Pago's 1MB limit.
 */
export async function renderReceiptToJpegBuffer(
  html: string,
  options: RenderReceiptOptions = {},
): Promise<Buffer> {
  const viewportWidth = options.viewportWidth ?? 384;
  const startAttempt: RenderAttempt = {
    quality: options.quality ?? 80,
    deviceScaleFactor: options.deviceScaleFactor ?? 2,
  };

  const browser = await chromium.launch();
  try {
    return await fitUnderSizeLimit(
      async (attempt) => {
        const page = await browser.newPage({
          viewport: { width: viewportWidth, height: 10 },
          deviceScaleFactor: attempt.deviceScaleFactor,
        });
        try {
          await page.setContent(html, { waitUntil: 'load' });
          const body = page.locator('body');
          const box = await body.boundingBox();
          const height = box ? Math.ceil(box.height) : 10;
          await page.setViewportSize({ width: viewportWidth, height });
          return await page.screenshot({
            type: 'jpeg',
            quality: attempt.quality,
          });
        } finally {
          await page.close();
        }
      },
      startAttempt,
      MAX_RECEIPT_BYTES,
    );
  } finally {
    await browser.close();
  }
}

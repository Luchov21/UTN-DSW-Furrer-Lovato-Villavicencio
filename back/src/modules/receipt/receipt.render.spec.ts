import {
  renderReceiptToJpegBuffer,
  fitUnderSizeLimit,
  type RenderAttempt,
} from './receipt.render';
import { buildReceiptHtml } from './receipt.html';

describe('fitUnderSizeLimit (retry/degrade policy)', () => {
  const start: RenderAttempt = { quality: 80, deviceScaleFactor: 2 };

  it('returns the first render when it already fits', async () => {
    const render = jest.fn().mockResolvedValue(Buffer.alloc(500_000));

    const buffer = await fitUnderSizeLimit(render, start, 1_000_000);

    expect(buffer.length).toBe(500_000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(start);
  });

  it('lowers quality before lowering deviceScaleFactor', async () => {
    const sizes = [2_000_000, 500_000];
    const render = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Buffer.alloc(sizes.shift() ?? 500_000)),
      );

    await fitUnderSizeLimit(render, start, 1_000_000);

    expect(render).toHaveBeenNthCalledWith(1, {
      quality: 80,
      deviceScaleFactor: 2,
    });
    expect(render).toHaveBeenNthCalledWith(2, {
      quality: 60,
      deviceScaleFactor: 2,
    });
  });

  it('lowers deviceScaleFactor once quality bottoms out', async () => {
    const render = jest
      .fn()
      .mockResolvedValueOnce(Buffer.alloc(2_000_000)) // q80
      .mockResolvedValueOnce(Buffer.alloc(2_000_000)) // q60
      .mockResolvedValueOnce(Buffer.alloc(2_000_000)) // q40
      .mockResolvedValueOnce(Buffer.alloc(500_000)); // scale down

    await fitUnderSizeLimit(render, start, 1_000_000, 4);

    expect(render).toHaveBeenNthCalledWith(4, {
      quality: 40,
      deviceScaleFactor: 1.5,
    });
  });

  it('throws a clear error when nothing fits within the attempt budget', async () => {
    const render = jest.fn().mockResolvedValue(Buffer.alloc(2_000_000));

    await expect(
      fitUnderSizeLimit(render, start, 1_000_000, 2),
    ).rejects.toThrow(/1000000 bytes after 2 attempts/);
  });
});

describe('renderReceiptToJpegBuffer (real Chromium render)', () => {
  jest.setTimeout(30_000);

  it('renders the receipt HTML into a JPEG buffer under 1MB', async () => {
    const html = buildReceiptHtml({
      orderId: 999,
      amount: 19995.5,
      dateTime: new Date('2026-09-01T14:30:00Z'),
      payMethod: 'efectivo',
      cashier: 'admin@flg.test',
    });

    const buffer = await renderReceiptToJpegBuffer(html);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // JPEG magic bytes.
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.length).toBeLessThanOrEqual(1_000_000);
  });
});

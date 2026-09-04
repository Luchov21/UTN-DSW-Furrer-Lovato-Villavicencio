import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MercadoPagoConfig {
  private readonly _enabled: boolean;
  private readonly _accessToken?: string;
  private readonly _publicKey?: string;
  private readonly _webhookSecret?: string;
  private readonly _pointTerminalId?: string;
  private readonly _qrExternalPosId?: string;
  private readonly _frontendUrl: string;

  constructor(config: ConfigService) {
    this._enabled = config.get<string>('MP_ENABLED') === 'true';

    if (this._enabled) {
      const missing: string[] = [];

      const accessToken = config.get<string>('MP_ACCESS_TOKEN');
      if (!accessToken) missing.push('MP_ACCESS_TOKEN');

      const publicKey = config.get<string>('MP_PUBLIC_KEY');
      if (!publicKey) missing.push('MP_PUBLIC_KEY');

      const webhookSecret = config.get<string>('MP_WEBHOOK_SECRET');
      if (!webhookSecret) missing.push('MP_WEBHOOK_SECRET');

      if (missing.length > 0) {
        throw new Error(
          `MP_ENABLED is 'true' but missing required credentials: ${missing.join(', ')}`,
        );
      }

      this._accessToken = accessToken;
      this._publicKey = publicKey;
      this._webhookSecret = webhookSecret;
    }

    // Optional fields
    this._pointTerminalId = config.get<string>('MP_POINT_TERMINAL_ID');
    this._qrExternalPosId = config.get<string>('MP_QR_EXTERNAL_POS_ID');

    // The public origin a member's browser can reach. Already the source of
    // truth for CORS (main.ts) and for the links in transactional mail
    // (mail.service.ts); back_urls is the third consumer, so it reads it from
    // here rather than adding another scattered process.env access.
    this._frontendUrl =
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get accessToken(): string | undefined {
    return this._accessToken;
  }

  get publicKey(): string | undefined {
    return this._publicKey;
  }

  get webhookSecret(): string | undefined {
    return this._webhookSecret;
  }

  get pointTerminalId(): string | undefined {
    return this._pointTerminalId;
  }

  get qrExternalPosId(): string | undefined {
    return this._qrExternalPosId;
  }

  get frontendUrl(): string {
    return this._frontendUrl;
  }
}

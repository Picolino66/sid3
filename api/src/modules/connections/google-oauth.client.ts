import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export type GoogleTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: Date | null;
  scopes: string[];
};

@Injectable()
export class GoogleOAuthClient {
  constructor(private readonly configService: ConfigService) {}

  createAuthorizationUrl(state: string): string {
    const client = this.createClient();

    return client.generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent',
      scope: this.getScopes(),
      state
    });
  }

  async exchangeCode(code: string): Promise<GoogleTokenResult> {
    const client = this.createClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new BadRequestException('Google OAuth did not return an access token');
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: this.getScopes()
    };
  }

  private createClient(): OAuth2Client {
    const clientId = this.getRequiredConfig('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.getRequiredConfig('GOOGLE_OAUTH_CLIENT_SECRET');
    const redirectUri = this.getRequiredConfig('GOOGLE_OAUTH_REDIRECT_URI');

    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  private getScopes(): string[] {
    const configuredScopes = this.configService.get<string>('GOOGLE_DRIVE_SCOPES');
    return configuredScopes?.split(/\s+/).filter(Boolean) ?? ['https://www.googleapis.com/auth/drive.file'];
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new BadRequestException(`${key} is not configured`);
    }

    return value;
  }
}

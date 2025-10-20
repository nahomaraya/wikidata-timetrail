import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WikidataAuthService {
  private readonly logger = new Logger(WikidataAuthService.name);
  private readonly wikidataUrl = 'https://www.wikidata.org/w/rest.php';
  private readonly clientId: string;
  private readonly clientSecret: string;

  private token: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.clientId = this.configService.get<string>('wikidata.clientId') ?? '';
    this.clientSecret = this.configService.get<string>('wikidata.clientSecret') ?? '';
  }

  /**
   * Public method to retrieve a valid access token.
   * Returns a cached token if still valid, otherwise fetches a new one.
   */
  async getAccessToken(): Promise<string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      this.logger.debug('Using cached access token');
      return this.token;
    }

    return this.fetchNewToken();
  }

  /**
   * Internal method that fetches a new access token from Wikidata.
   */
  private async fetchNewToken(): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.wikidataUrl}/oauth2/access_token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      const { access_token, expires_in } = response.data;

      this.token = access_token;
      this.tokenExpiry = Date.now() + expires_in * 1000;

      this.logger.log(`Fetched new access token (expires in ${expires_in}s)`);

      return this.token ?? '';
    } catch (error) {
      this.logger.error(`Failed to fetch access token: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException('Failed to fetch Wikidata access token', 500);
    }
  }

  /**
   * Clears the current token (can be used when Wikidata returns 401)
   */
  invalidateToken() {
    this.logger.warn('Invalidating cached Wikidata token');
    this.token = null;
    this.tokenExpiry = null;
  }
}

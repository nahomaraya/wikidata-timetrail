import { Injectable, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SparqlService, SparqlValueResult } from './sparql.service';
import pLimit from 'p-limit';
import { AxiosResponse } from 'axios';
import * as T from '../interfaces/wikidata.interface';

@Injectable()
export class WikidataService {
  private readonly logger = new Logger(WikidataService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly wikidataUrl: string = 'https://www.wikidata.org/w/rest.php';
  private readonly targetIds: string[];
  private readonly dateIds: string[];
  private readonly locationIds: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly sparqlService: SparqlService,
  ) {
    this.clientId = this.configService.get<string>('wikidata.clientId') ?? '';
    this.clientSecret =
      this.configService.get<string>('wikidata.clientSecret') ?? '';
    this.targetIds = this.configService
      .get<string>('RELATION_IDS', '')
      .split(',')
      .map((id) => id.trim().replace(/\r?\n|\r/g, ''))
      .filter(Boolean);
    this.dateIds = this.configService
      .get<string>('DATE_IDS', '')
      .split(',')
      .map((id) => id.trim().replace(/\r?\n|\r/g, ''))
      .filter(Boolean);
    this.locationIds = this.configService
      .get<string>('LOCATION_IDS', '')
      .split(',')
      .map((id) => id.trim().replace(/\r?\n|\r/g, ''))
      .filter(Boolean);
  }

  private async fetchAccessToken(): Promise<string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      this.logger.debug('Using cached access token');
      return this.token;
    }

    try {
      const response: AxiosResponse<T.WikidataTokenResponse> =
        await firstValueFrom(
          this.httpService.post(
            `${this.wikidataUrl}/oauth2/access_token`,
            new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: this.clientId,
              client_secret: this.clientSecret,
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Wikidata timetrail/1.0 (nahomaraya8@gmail.com)',
              },
            },
          ),
        );

      this.token = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;

      return this.token;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch access token: ${errorMessage}`);
      throw new HttpException(
        'Failed to fetch access token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseWikidataDate(dateValue: T.WikidataTimeObject): Date | null {
    try {
      let timeString: string;

      if (typeof dateValue === 'object' && dateValue.time) {
        timeString = dateValue.time;
      } else if (typeof dateValue === 'string') {
        timeString = dateValue;
      } else {
        this.logger.warn(
          `Unexpected date value format: ${JSON.stringify(dateValue)}`,
        );
        return null;
      }

      let cleanDate = timeString.startsWith('+')
        ? timeString.substring(1)
        : timeString;

      cleanDate = cleanDate.replace(/-00-/g, '-01-').replace(/-00T/g, '-01T');

      const date = new Date(cleanDate);
      if (isNaN(date.getTime())) {
        this.logger.warn(`Invalid date format: ${timeString}`);
        return null;
      }

      return date;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse date: ${errorMessage}`);
      return null;
    }
  }

  private async getItemEntity(itemId: string): Promise<T.WikidataEntity> {
    const accessToken = await this.fetchAccessToken();
    const url = `${this.wikidataUrl}/wikibase/v1/entities/items/${itemId}`;
    try {
      const response: AxiosResponse<T.WikidataEntity> = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to fetch Wikidata entity ${itemId}: ${errorMessage}`,
      );
      throw new HttpException(
        'Failed to fetch Wikidata entity',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private extractWikipediaLinks(
    sitelinks: T.WikidataEntity['sitelinks'],
    language?: string,
  ): Array<{ language: string; title: string; url: string }> {
    this.logger.log('Getting wikipedia links');

    if (!sitelinks) return [];

    const links = Object.entries(sitelinks)
      .filter(([key]) => key.endsWith('wiki'))
      .map(([key, link]) => ({
        language: key.replace('wiki', ''),
        title: link.title,
        url:
          link.url ??
          `https://${key.replace('wiki', '')}.wikipedia.org/wiki/${encodeURIComponent(link.title)}`,
      }));

    if (language) {
      return links.filter((l) => l.language === language);
    }

    return links;
  }

  getItemDate(statements: T.WikidataStatementsResponse): string | null {
    try {
      for (const propId of this.dateIds) {
        const dateStatement = statements[propId]?.[0];
        if (!dateStatement) continue;

        if (dateStatement.value.type === 'time') {
          const dateValue = dateStatement.value.content;
          const parsedDate = this.parseWikidataDate(dateValue);
          if (parsedDate) {
            return parsedDate.toISOString();
          }
        }
      }

      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to fetch date: ${errorMessage}`);
      return null;
    }
  }

  async getItemLocation(
    statements: T.WikidataStatementsResponse,
  ): Promise<T.LocationInfo | null> {
    try {
      const locationPropertyCandidates = [
        this.configService.get<string>('wikidata.locationPropertyId'),
        ...(this.locationIds ?? []),
      ].filter((id): id is string => Boolean(id));

      for (const propId of locationPropertyCandidates) {
        const locationStatement = statements[propId]?.[0];

        if (!locationStatement) {
          continue;
        }

        if (locationStatement.value.type !== 'wikibase-entityid') {
          continue;
        }

        const locationId = locationStatement.value.content.id;
        if (!locationId) {
          continue;
        }

        const locationName = await this.getItemName(locationId);
        const locationDetails = await this.getItemStatements(locationId);

        const coordinatesPropertyId = this.configService.get<string>(
          'wikidata.coordinatesPropertyId',
        );
        const coordinateStatement = coordinatesPropertyId
          ? locationDetails[coordinatesPropertyId]?.[0]
          : null;

        if (
          coordinateStatement &&
          coordinateStatement.value.type === 'globecoordinate'
        ) {
          const coordinates = coordinateStatement.value.content;
          return {
            locationName,
            latitude: coordinates.latitude.toString(),
            longitude: coordinates.longitude.toString(),
          };
        } else {
          return {
            locationName,
            latitude: '',
            longitude: '',
          };
        }
      }

      this.logger.log(
        'No location found for any property ID:',
        locationPropertyCandidates,
      );
      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to fetch location: ${errorMessage}`);
      return null;
    }
  }

  async getItemName(itemId: string): Promise<string> {
    const accessToken = await this.fetchAccessToken();
    const isProperty = itemId.startsWith('P');
    const url = isProperty
      ? `${this.wikidataUrl}/wikibase/v1/entities/properties/${itemId}`
      : `${this.wikidataUrl}/wikibase/v1/entities/items/${itemId}`;

    try {
      const response: AxiosResponse<T.WikidataEntity> = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const entity = response.data;
      const labels = entity?.labels;

      if (!labels) {
        this.logger.warn(`No labels found for item: ${itemId}`);
        return '';
      }

      const itemLabel =
        labels.en?.value ?? labels[Object.keys(labels)[0]]?.value ?? '';

      if (!itemLabel) {
        this.logger.warn(`No label found for item: ${itemId}`);
      }

      this.logger.log(itemLabel);
      return itemLabel;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';
      this.logger.error(
        `Failed to fetch Wikidata item label for ${itemId}: ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        `Failed to fetch item label for ${itemId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getItemData(itemId: string): Promise<{
    statements: T.WikidataStatementsResponse;
    identifiers: { property: string; value: string; url?: string }[];
    wikipediaLinks: string | undefined;
  }> {
    const [statements, entity] = await Promise.all([
      this.getItemStatements(itemId),
      this.getItemEntity(itemId),
    ]);

    this.logger.log('Getting items with statements and wikipedia links');
    const identifiers = this.extractIdentifiers(statements);
    const wikipediaLinks = entity?.sitelinks
      ? this.extractWikipediaLinks(entity.sitelinks, 'en')[0]?.url
      : undefined;

    return { statements, identifiers, wikipediaLinks };
  }

  async getItemStatements(
    itemId: string,
  ): Promise<T.WikidataStatementsResponse> {
    const accessToken = await this.fetchAccessToken();
    const url = `${this.wikidataUrl}/wikibase/v1/entities/items/${itemId}/statements`;

    try {
      const response: AxiosResponse<T.WikidataStatementsResponse> =
        await firstValueFrom(
          this.httpService.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }),
        );

      return response.data;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to fetch Wikidata item ${itemId}: ${errorMessage}`,
      );
      throw new HttpException(
        'Failed to fetch Wikidata item',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPropertyStatements(
    propertyId: string,
  ): Promise<Record<string, T.WikidataOldFormatStatement[]>> {
    try {
      if (!propertyId.startsWith('P')) {
        throw new Error(`Invalid property ID: ${propertyId}`);
      }

      const url = `https://www.wikidata.org/wiki/Special:EntityData/${propertyId}.json`;

      const response: AxiosResponse<T.WikidataEntityDataResponse> =
        await firstValueFrom(
          this.httpService.get(url, {
            headers: {
              'User-Agent': 'Wikidata timetrail/1.0 (nahomaraya8@gmail.com)',
            },
          }),
        );

      const data = response.data?.entities?.[propertyId];

      if (!data) {
        throw new Error(`No data found for property ${propertyId}`);
      }

      const statements = data.claims || {};

      this.logger.log(
        `Fetched ${Object.keys(statements).length} statements for property ${propertyId}`,
      );

      return statements;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to fetch Wikidata property ${propertyId}: ${errorMessage}`,
      );
      throw new HttpException(
        'Failed to fetch Wikidata property',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  extractIdentifiers(
    statements: T.WikidataStatementsResponse,
  ): { property: string; value: string; url?: string }[] {
    this.logger.log('Extracting identifiers...');
    const identifiers: { property: string; value: string; url?: string }[] = [];

    for (const [prop, values] of Object.entries(statements)) {
      if (!Array.isArray(values)) continue;
      identifiers.push(...this._processPropertyValues(prop, values));
    }

    return identifiers;
  }

  private _processPropertyValues(
    prop: string,
    values: T.WikidataStatement[],
  ): { property: string; value: string; url?: string }[] {
    const identifiers: { property: string; value: string; url?: string }[] = [];

    for (const statement of values) {
      // Extract URL from value if it's a string type
      if (statement.value.type === 'string') {
        const value = statement.value.content;
        if (value.startsWith('http')) {
          identifiers.push({ property: prop, value, url: value });
        }
      }

      // Extract URLs from references
      if (statement.references) {
        const refUrls = this._extractUrlsFromReferences(
          statement.references,
          prop,
        );
        identifiers.push(...refUrls);
      }
    }

    return identifiers;
  }

  private _extractUrlsFromReferences(
    refs: T.WikidataReference[],
    prop: string,
  ): { property: string; value: string; url?: string }[] {
    const urls: { property: string; value: string; url?: string }[] = [];

    for (const ref of refs) {
      if (!Array.isArray(ref.parts)) continue;

      for (const part of ref.parts) {
        if (part.value.type === 'string') {
          const urlValue = part.value.content;
          if (urlValue.startsWith('http')) {
            urls.push({ property: prop, value: urlValue, url: urlValue });
          }
        }
      }
    }

    return urls;
  }

  async getEntityIdFromName(
    name: string,
    language: string = 'en',
    entityType: 'item' | 'property' = 'item',
  ): Promise<string | null> {
    const url = `https://www.wikidata.org/w/api.php`;

    try {
      const response: AxiosResponse<T.WikidataSearchResponse> =
        await firstValueFrom(
          this.httpService.get(url, {
            params: {
              action: 'wbsearchentities',
              search: name,
              language,
              format: 'json',
              type: entityType,
              limit: 1,
            },
            headers: {
              'User-Agent': 'Wikidata timetrail/1.0 (nahomaraya8@gmail.com)',
            },
          }),
        );

      const searchResults = response.data?.search || [];

      if (searchResults.length === 0) {
        this.logger.warn(`No Wikidata ${entityType} found for name: "${name}"`);
        return null;
      }

      const entityId = searchResults[0].id;
      this.logger.log(
        `Found Wikidata ${entityType} for "${name}": ${entityId}`,
      );

      return entityId;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';
      this.logger.error(
        `Failed to fetch Wikidata ${entityType}Id for "${name}": ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        `Failed to fetch Wikidata ${entityType}Id from name`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getItemIdFromName(
    name: string,
    language: string = 'en',
  ): Promise<string | null> {
    const url = `https://www.wikidata.org/w/api.php`;
    try {
      const response: AxiosResponse<T.WikidataSearchResponse> =
        await firstValueFrom(
          this.httpService.get(url, {
            params: {
              action: 'wbsearchentities',
              search: name,
              language,
              format: 'json',
              type: 'item',
              limit: 1,
            },
            headers: {
              'User-Agent': 'Wikidata timetrail/1.0 (nahomaraya8@gmail.com)',
            },
          }),
        );

      const searchResults = response.data?.search || [];

      if (searchResults.length === 0) {
        this.logger.warn(`No Wikidata entity found for name: "${name}"`);
        return null;
      }

      const itemId = searchResults[0].id;
      this.logger.log(`Found Wikidata entity for "${name}": ${itemId}`);

      return itemId;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';
      this.logger.error(
        `Failed to fetch Wikidata itemId for "${name}": ${errorMessage}`,
        errorStack,
      );
      throw new HttpException(
        'Failed to fetch Wikidata itemId from name',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private isSubclassOrInstanceOf = async (
    entityId: string,
    targetIds: string[],
  ): Promise<boolean> => {
    try {
      const entityStatements = await this.getPropertyStatements(entityId);

      const instanceOf: T.WikidataOldFormatStatement[] =
        entityStatements['P31'] || [];
      const subclassOf: T.WikidataOldFormatStatement[] =
        entityStatements['P279'] || [];
      const subPropertyOf: T.WikidataOldFormatStatement[] =
        entityStatements['P1647'] || [];

      const relatedIds: string[] = [
        ...instanceOf.map((v) => v.mainsnak?.datavalue?.value?.id),
        ...subclassOf.map((v) => v.mainsnak?.datavalue?.value?.id),
        ...subPropertyOf.map((v) => v.mainsnak?.datavalue?.value?.id),
      ].filter((id): id is string => Boolean(id));
      return relatedIds.some((id) => targetIds.includes(id));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Relation check failed for ${entityId}: ${errorMessage}`,
      );
      return false;
    }
  };

  async getMultiValueProperties(
    statements: T.WikidataStatementsResponse,
    itemId?: string,
  ): Promise<string[]> {
    try {
      if (!statements || typeof statements !== 'object') {
        this.logger.warn('Invalid statements input');
        return [];
      }

      const limit = pLimit(5);

      const tasks = Object.entries(statements).map(([propId]) =>
        limit(async () => {
          const isRelevant = await this.isSubclassOrInstanceOf(
            propId,
            this.targetIds,
          );
          if (!isRelevant) return null;

          const values: SparqlValueResult[] =
            await this.sparqlService.getValuesFromProperty(
              itemId ?? '',
              propId,
            );
          const entityIds = values
            .map((v) => v.valueQID?.value)
            .filter((id): id is string => Boolean(id));

          const distinctEntityIds = [...new Set(entityIds)];
          return distinctEntityIds.length > 1 ? propId : null;
        }),
      );

      const results = await Promise.allSettled(tasks);
      const multiValueProps = results
        .filter(
          (r): r is PromiseFulfilledResult<string> =>
            r.status === 'fulfilled' && r.value !== null,
        )
        .map((r) => r.value);
      return multiValueProps;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';
      this.logger.error(
        `Failed to find multi-value properties: ${errorMessage}`,
        errorStack,
      );
      return [];
    }
  }
}

export default WikidataService;

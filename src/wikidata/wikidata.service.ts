import { Injectable, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SparqlService } from './sparql.service';
import pLimit from 'p-limit';

interface LocationInfo {
  locationName: string;
  latitude: string,
  longitude: string,
}

@Injectable()
export class WikidataService {
  private readonly logger = new Logger(WikidataService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly wikidataUrl: string = 'https://www.wikidata.org/w/rest.php';
  private readonly targetIds : string[];
  private readonly dateIds : string[];
  private readonly locationIds : string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly sparqlService: SparqlService
  ) {
    this.clientId = this.configService.get<string>('wikidata.clientId') ?? '';
    this.clientSecret = this.configService.get<string>('wikidata.clientSecret') ?? '';
    this.targetIds = this.configService
      .get<string>('RELATION_IDS', '')
      .split(',')
      .map(id => id.trim().replace(/\r?\n|\r/g, ''))
      .filter(Boolean);
    this.dateIds =this.configService
    .get<string>('DATE_IDS', '')
    .split(',')
    .map(id => id.trim().replace(/\r?\n|\r/g, ''))
    .filter(Boolean);
    this.locationIds =this.configService
    .get<string>('LOCATION_IDS', '')
    .split(',')
    .map(id => id.trim().replace(/\r?\n|\r/g, ''))
    .filter(Boolean);
  }

  private async fetchAccessToken(): Promise<string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      this.logger.debug('Using cached access token');
      return this.token;
    }

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

      this.token = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;

      // this.logger.log(`New access token fetched. Expires in ${response.data.expires_in}s`);

      return this.token!;
    } catch (error) {
      this.logger.error(`Failed to fetch access token: ${error.message}`);
      throw new HttpException('Failed to fetch access token', 500);
    }
  }

  private parseWikidataDate(dateValue: any): Date | null {
    try {
      let timeString: string;

      // Wikidata encodes time as an object with a `time` field (e.g., { time: '+1917-01-01T00:00:00Z', precision: 9 })
      if (typeof dateValue === 'object' && dateValue.time) {
        timeString = dateValue.time;
      }
      // In some rare cases, it's just a plain string
      else if (typeof dateValue === 'string') {
        timeString = dateValue;
      }
      else {
        this.logger.warn(`Unexpected date value format: ${JSON.stringify(dateValue)}`);
        return null;
      }

      // Remove leading "+" if present
      let cleanDate = timeString.startsWith('+') ? timeString.substring(1) : timeString;

      // Replace invalid month/day zeros with defaults
      cleanDate = cleanDate.replace(/-00-/g, '-01-').replace(/-00T/g, '-01T');

      const date = new Date(cleanDate);
      if (isNaN(date.getTime())) {
        this.logger.warn(`Invalid date format: ${timeString}`);
        return null;
      }

      return date;
    } catch (error) {
      this.logger.warn(`Failed to parse date: ${error.message}`);
      return null;
    }
  }

  private async getItemEntity(itemId: string) {
    const accessToken = await this.fetchAccessToken();
    const url = `${this.wikidataUrl}/wikibase/v1/entities/items/${itemId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch Wikidata entity ${itemId}: ${error.message}`);
      throw new HttpException('Failed to fetch Wikidata entity', 500);
    }
  }
  
  private extractWikipediaLinks(sitelinks: any, language?: string) {
    this.logger.log("Getting wikipedia links");
  
    const links = Object.entries(sitelinks)
      .filter(([key]) => key.endsWith('wiki'))
      .map(([key, link]: [string, any]) => ({
        language: key.replace('wiki', ''),
        title: link.title,
        url: link.url ?? `https://${key.replace('wiki', '.wikipedia.org/wiki/')}${encodeURIComponent(link.title)}`
      }));
  
  
      if (language) {
      return links.filter(l => l.language === language);
    }

    return links;
  }
  
  

  async getItemDate(statements): Promise<string | null> {
    try {
      for (const propId of this.dateIds) {
        const dateStatement = statements[propId]?.[0];
        const dateValue = dateStatement?.value?.content ?? null;
        if (dateValue) {
          const parsedDate = this.parseWikidataDate(dateValue);
          if (parsedDate) {
            return parsedDate.toISOString();
          }
        }
      }

      return null; // No date found
    } catch (error) {
      this.logger.warn(`Failed to fetch date for: ${error.message}`);
      return null;
    }
  }


  async getItemLocation(statements): Promise<LocationInfo | null> {
    try {
      this.logger.log('Parsed LOCATION_IDS:', this.locationIds);
      const locationPropertyCandidates = [
        this.configService.get('wikidata.locationPropertyId'),
        this.locationIds,
      ].filter(Boolean);

      for (const propId of locationPropertyCandidates) {
        const locationStatement = statements[propId]?.[0];
        if (!locationStatement) continue;
        this.logger.log(propId);
        const locationId = locationStatement.value?.content ?? null;
        if (!locationId) continue;

        const locationName = await this.getItemName(locationId);
        const locationDetails = await this.getItemStatements(locationId);
     
        const coordinates =
          locationDetails.statements[this.configService.get('wikidata.coordinatesPropertyId')]?.[0]
            ?.value?.content ?? null;

        if (coordinates) {
          return {
            locationName,
            latitude: coordinates.latitude?.toString() ?? '',
            longitude: coordinates.longitude?.toString() ?? '',
          };
        } else {
          // If coordinates not available, still return the name
          return {
            locationName,
            latitude: '',
            longitude: '',
          };
        }
      }

      return null; // No location found
    } catch (error) {
      this.logger.warn(`Failed to fetch location: ${error.message}`);
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
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const entity = response.data;
      // Labels are nested under entity.labels.<lang>.value
      const itemLabel =
        entity?.labels?.en ??
        entity?.labels?.[Object.keys(entity.labels || {})[0]] ??
        '';

      if (!itemLabel) {
        this.logger.warn(`No label found for item: ${itemId}`);
      }

      this.logger.log(itemLabel);
      return itemLabel;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Wikidata item label for ${itemId}: ${error.message}`,
        error.stack,
      );
      throw new HttpException(`Failed to fetch item label for ${itemId}`, 500);
    }
  }

  async getItemData(itemId: string) {
    const [statements, entity] = await Promise.all([
      this.getItemStatements(itemId),
      this.getItemEntity(itemId),
    ]);
  
    this.logger.log("Getting items with statements and wikipedia links")
    const identifiers = await this.extractIdentifiers(statements);
    const wikipediaLinks = entity?.sitelinks ? this.extractWikipediaLinks(entity.sitelinks, 'en')[0]?.url : [];
  
    return { statements, identifiers, wikipediaLinks };
  }
  
  async getItemStatements(itemId: string) {
    const accessToken = await this.fetchAccessToken();
    const url = `${this.wikidataUrl}/wikibase/v1/entities/items/${itemId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Wikidata item ${itemId}: ${error.message}`,
      );
      throw new HttpException('Failed to fetch Wikidata item', 500);
    }
  }

  async getPropertyStatements(propertyId: string) {
    try {
      if (!propertyId.startsWith('P')) {
        throw new Error(`Invalid property ID: ${propertyId}`);
      }

      // Use the old but stable entitydata endpoint
      const url = `https://www.wikidata.org/wiki/Special:EntityData/${propertyId}.json`;

      const response = await firstValueFrom(this.httpService.get(url));

      const data = response.data?.entities?.[propertyId];

      if (!data) {
        throw new Error(`No data found for property ${propertyId}`);
      }

      // Extract claims (statements) directly
      const statements = data.claims || {};

      this.logger.log(
        `Fetched ${Object.keys(statements).length} statements for property ${propertyId}`,
      );

      return statements;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Wikidata property ${propertyId}: ${error.message}`,
      );
      throw new HttpException('Failed to fetch Wikidata property', 500);
    }
  }

  async extractIdentifiers(statements: any): Promise<{ property: string; value: string; url?: string }[]> {
    this.logger.log('Extracting identifiers...');
    const identifiers: { property: string; value: string; url?: string }[] = [];
  
    for (const [prop, values] of Object.entries(statements)) {
      if (!Array.isArray(values)) continue;
      identifiers.push(...this._processPropertyValues(prop, values));
    }
  
    return identifiers;
  }
  
  /**
   * Processes all values under a single property.
   */
  private _processPropertyValues(prop: string, values: any[]): { property: string; value: string; url?: string }[] {
    const identifiers: { property: string; value: string; url?: string }[] = [];
  
    for (const v of values) {
      // Extract URL from mainsnak
      const mainUrl = this._extractUrlFromMainSnak(v, prop);
      if (mainUrl) identifiers.push(mainUrl);
  
      // Extract URLs from references
      const refUrls = this._extractUrlsFromReferences(v.references, prop);
      identifiers.push(...refUrls);
    }
  
    return identifiers;
  }
  
  /**
   * Extract a URL if mainsnak is a URL type.
   */
  private _extractUrlFromMainSnak(v: any, prop: string): { property: string; value: string; url?: string } | null {
    if (v.mainsnak?.datatype !== 'url') return null;
  
    const value = v.mainsnak?.datavalue?.value ?? '';
    if (!value) return null;
  
    let url: string | undefined;
    if (v.propertyInfo?.formatterUrl) {
      url = v.propertyInfo.formatterUrl.replace('$1', encodeURIComponent(value));
    }
  
    return { property: prop, value, url };
  }
  
  /**
   * Extract URLs from nested reference parts.
   */
  private _extractUrlsFromReferences(refs: any[], prop: string): { property: string; value: string; url?: string }[] {
    if (!Array.isArray(refs)) return [];
  
    const urls: { property: string; value: string; url?: string }[] = [];
  
    for (const ref of refs) {
      if (!Array.isArray(ref.parts)) continue;
  
      for (const part of ref.parts) {
        if (part.property?.data_type !== 'url') continue;
  
        const urlValue = part.value?.content ?? '';
        if (urlValue) urls.push({ property: prop, value: urlValue, url: urlValue });
      }
    }
  
    return urls;
  }
  
  

  async getEntityIdFromName(
    name: string,
    language: string = 'en',
    entityType: 'item' | 'property' = 'item', // can be 'item' or 'property'
  ): Promise<string | null> {
    const url = `https://www.wikidata.org/w/api.php`;
  
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            action: 'wbsearchentities',
            search: name,
            language,
            format: 'json',
            type: entityType,
            limit: 1, // top match only
          },
        }),
      );
  
      const searchResults = response.data?.search || [];
  
      if (searchResults.length === 0) {
        this.logger.warn(
          `No Wikidata ${entityType} found for name: "${name}"`,
        );
        return null;
      }
  
      const entityId = searchResults[0].id; // e.g. "Q42" or "P31"
      this.logger.log(
        `Found Wikidata ${entityType} for "${name}": ${entityId}`,
      );
  
      return entityId;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Wikidata ${entityType}Id for "${name}": ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to fetch Wikidata ${entityType}Id from name`,
        500,
      );
    }
  }
  
  async getItemIdFromName(name: string, language: string = 'en'): Promise<string | null> {
    const url = `https://www.wikidata.org/w/api.php`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: {
            action: 'wbsearchentities',
            search: name,
            language,
            format: 'json',
            type: 'item',
            limit: 1, // return top match only
          },
        }),
      );

      const searchResults = response.data?.search || [];

      if (searchResults.length === 0) {
        this.logger.warn(`No Wikidata entity found for name: "${name}"`);
        return null;
      }

      const itemId = searchResults[0].id; // e.g. "Q947667"
      this.logger.log(`Found Wikidata entity for "${name}": ${itemId}`);

      return itemId;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Wikidata itemId for "${name}": ${error.message}`,
        error.stack,
      );
      throw new HttpException('Failed to fetch Wikidata itemId from name', 500);
    }
  }

  
      // 🔹 Helper: check if entity is instance/subclass of *any* of these targets
  private isSubclassOrInstanceOf = async (
        entityId: string,
        targetIds: string[],
      ): Promise<boolean> => {
        try {
          // Use the unified entity fetcher (works for Qs or Ps)
          const entityStatements = await this.getPropertyStatements(entityId);

          const instanceOf = entityStatements['P31'] || []; // instance of
          const subclassOf = entityStatements['P279'] || []; // subclass of
          const subPropertyOf = entityStatements['P1647'] || [];

          const relatedIds = [
            ...instanceOf.map(v => v.mainsnak?.datavalue?.value?.id),
            ...subclassOf.map(v => v.mainsnak?.datavalue?.value?.id),
            ...subPropertyOf.map(v => v.mainsnak?.datavalue?.value?.id),
          ].filter(Boolean);

          // ✅ Check if any related ID matches any of the targets
          return relatedIds.some(id => targetIds.includes(id));
        } catch (e) {
          this.logger.warn(`Relation check failed for ${entityId}: ${e.message}`);
          return false;
        }
  };
  
  async getMultiValueProperties(

    statements: Record<string, any[]>,
    itemId?: string,
  ): Promise<string[]> {
    try {
      if (!statements || typeof statements !== 'object') {
        this.logger.warn('Invalid statements input');
        return [];
      }



      const limit = pLimit(5); // 5 concurrent requests at a time

      //use array of tasks instead of loops
      const tasks = Object.entries(statements.statements).map(([propId]) =>
        limit(async () => {
      const isRelevant = await this.isSubclassOrInstanceOf(propId, this.targetIds);
      if (!isRelevant) return null;

      const values = await this.sparqlService.getValuesFromProperty(itemId ?? '', propId);
      const entityIds = values
      .map(v => v.valueQID?.value)
      .filter((id): id is string => Boolean(id));

      const distinctEntityIds = [...new Set(entityIds)];
      return distinctEntityIds.length > 1 ? propId : null;
    }),
  );

      const results = await Promise.allSettled(tasks);
      const multiValueProps = results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => (r as PromiseFulfilledResult<string>).value);
      return multiValueProps;
    } catch (error) {
      this.logger.error(`Failed to find multi-value properties: ${error.message}`, error.stack);
      return [];
    }
  }



}

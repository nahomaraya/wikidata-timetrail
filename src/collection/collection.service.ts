import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { WikidataService } from '../wikidata/wikidata.service';
import { CommonsService, CommonsImageInfo } from '../wikidata/commons.service';
import { SparqlService } from '../wikidata/sparql.service';
import {
  Collection,
  SparqlItemResult,
  SparqlValueResult,
  ValueDetailsResult,
} from './collection.interface';
import { ConfigService } from '@nestjs/config';
import pLimit from 'p-limit';
import * as T from '../interfaces/wikidata.interface';

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    private readonly wikidataService: WikidataService,
    private readonly commonsService: CommonsService,
    private readonly sparqlService: SparqlService,
    private readonly configService: ConfigService,
  ) {}

  private async getItemDetails(
    items: SparqlItemResult[],
  ): Promise<Collection[]> {
    const itemPromises = items.map(async (item) => {
      try {
        const qid = item.item.value.split('/').pop()!;
        const name = item.itemLabel?.value ?? '';
        const desc = item.itemDescription?.value ?? '';

        const statements = await this.wikidataService.getItemStatements(qid);
        const { identifiers, wikipediaLinks } =
          await this.wikidataService.getItemData(qid);
        const identifier = this.getFirstItemIdentifier(
          statements,
          identifiers,
          wikipediaLinks,
        );

        const locationPropertyId = this.configService.get<string>(
          'wikidata.locationPropertyId',
        );
        const locationStatement = locationPropertyId
          ? statements[locationPropertyId]?.[0]
          : null;

        let locationId: string | null = null;
        if (locationStatement?.value.type === 'wikibase-entityid') {
          locationId = locationStatement.value.content.id;
        }

        let location: T.LocationInfo | null = null;
        if (locationId) {
          const locationStatements =
            await this.wikidataService.getItemStatements(locationId);
          const locationName =
            await this.wikidataService.getItemName(locationId);

          const coordinatesPropertyId = this.configService.get<string>(
            'wikidata.coordinatesPropertyId',
          );
          const coordinateStatement = coordinatesPropertyId
            ? locationStatements[coordinatesPropertyId]?.[0]
            : null;

          if (coordinateStatement?.value.type === 'globecoordinate') {
            const coords = coordinateStatement.value.content;
            location = {
              locationName,
              latitude: coords.latitude.toString(),
              longitude: coords.longitude.toString(),
            };
          }
        }

        const imagePropertyId = this.configService.get<string>(
          'wikidata.imagePropertyId',
        );
        const imageStatement = imagePropertyId
          ? statements[imagePropertyId]?.[0]
          : null;
        const imageName =
          imageStatement?.value.type === 'string'
            ? imageStatement.value.content
            : null;

        let imageInfo: CommonsImageInfo | { error: string } | null = null;
        if (imageName) {
          imageInfo = await this.commonsService.getImageByName(imageName);
        }

        return {
          id: qid,
          name,
          desc,
          location,
          image: imageInfo,
          identifier,
        };
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Error ingesting item ${item.item.value}: ${errorMessage}`,
        );
        return null;
      }
    });

    const results = await Promise.all(itemPromises);
    return results.filter((r): r is Collection => r !== null);
  }

  private async getValueDetails(
    items: SparqlValueResult[],
  ): Promise<ValueDetailsResult[]> {
    const limit = pLimit(5);
    const itemPromises = items.map(async (item) =>
      limit(async () => {
        try {
          const qid = item.valueQID?.value ?? '';
          const name = item.valueLabel?.value ?? '';
          const desc = item.valueDescription?.value ?? '';

          const { statements, wikipediaLinks } =
            await this.wikidataService.getItemData(qid);

          const location: T.LocationInfo | null =
            await this.wikidataService.getItemLocation(statements);
          const date = this.wikidataService.getItemDate(statements);

          const imagePropertyId = this.configService.get<string>(
            'wikidata.imagePropertyId',
          );
          const imageStatement = imagePropertyId
            ? statements[imagePropertyId]?.[0]
            : null;
          const imageName =
            imageStatement?.value.type === 'string'
              ? imageStatement.value.content
              : null;

          this.logger.log(imageName);
          let imageInfo: CommonsImageInfo | { error: string } | null = null;
          if (imageName) {
            imageInfo = await this.commonsService.getImageByName(imageName);
          }

          return {
            id: qid,
            name,
            desc,
            location,
            date,
            image: imageInfo,
            wikipediaLinks,
          };
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(
            `Error ingesting item ${item.valueQID?.value}: ${errorMessage}`,
          );
          return null;
        }
      }),
    );
    const results = await Promise.all(itemPromises);
    const filtered = results.filter((r): r is ValueDetailsResult => {
      return r !== null;
    });

    filtered.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return filtered;
  }

  private getFirstItemIdentifier(
    statements: T.WikidataStatementsResponse,
    identifiers: { property: string; value: string; url?: string }[],
    wikipediaLinks?: string,
  ): string | null {
    // 1️⃣ Prefer explicit identifiers that have URLs
    const firstIdentifierWithUrl = identifiers.find((id) => !!id.url);
    if (firstIdentifierWithUrl) return firstIdentifierWithUrl.url!;

    // 2️⃣ Then fall back to Wikipedia links (if any)
    if (wikipediaLinks && typeof wikipediaLinks === 'string') {
      return wikipediaLinks;
    }

    // 3️⃣ Try to extract direct URLs from statement values
    for (const statementArray of Object.values(statements)) {
      for (const statement of statementArray) {
        if (statement.value.type === 'string') {
          const val = statement.value.content;
          if (val.startsWith('http')) {
            return val;
          }
        }
      }
    }

    // 4️⃣ Check URLs in references
    for (const statementArray of Object.values(statements)) {
      for (const statement of statementArray) {
        if (statement.references) {
          for (const ref of statement.references) {
            for (const part of ref.parts) {
              if (part.value.type === 'string') {
                const refVal = part.value.content;
                if (refVal.startsWith('http')) {
                  return refVal;
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  async queryItemsWithFilters(
    year?: number,
    timePeriod?: string,
  ): Promise<Collection[]> {
    const qid = await this.wikidataService.getItemIdFromName(timePeriod ?? '');
    if (qid === null) {
      throw new HttpException(
        `Wikidata item not found for time period: ${timePeriod}`,
        HttpStatus.NOT_FOUND,
      );
    }
    const items = await this.sparqlService.queryItemsWithFilters(
      year ? year.toString() : undefined,
      qid,
    );
    return this.getItemDetails(items);
  }

  async getLootedItems(): Promise<Collection[]> {
    const items = await this.sparqlService.queryItems();
    return this.getItemDetails(items);
  }

  async getMultipleValue(
    itemId?: string,
    propertyId?: string,
  ): Promise<ValueDetailsResult[]> {
    const items = await this.sparqlService.getValuesFromProperty(
      itemId ?? '',
      propertyId ?? '',
    );
    return this.getValueDetails(items);
  }

  async getMultipeProps(itemId: string): Promise<string[]> {
    const statements = await this.wikidataService.getItemStatements(itemId);
    const multiValueProps = await this.wikidataService.getMultiValueProperties(
      statements,
      itemId,
    );
    const names = await Promise.all(
      multiValueProps.map((propId) => this.wikidataService.getItemName(propId)),
    );
    return names;
  }
}

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { StateService } from '../state/state.service';
import { AxiosError, AxiosResponse } from 'axios';

export interface SparqlBinding {
  type: 'uri' | 'literal' | 'bnode';
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}

export interface SparqlValueResult {
  value: SparqlBinding;
  valueLabel?: SparqlBinding;
  valueQID?: SparqlBinding;
  valueDescription?: SparqlBinding;
  start_time?: SparqlBinding;
  end_time?: SparqlBinding;
  point_in_time?: SparqlBinding;
}

@Injectable()
export class SparqlService {
  private readonly logger = new Logger(SparqlService.name);
  private sparqlUrl: string = 'https://query.wikidata.org/sparql';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly stateService: StateService,
  ) {}

  /**
   * Generic SPARQL executor
   */
  private async runQuery(sparqlQuery: string): Promise<SparqlValueResult[]> {
    const fullUrl =
      this.sparqlUrl + '?query=' + encodeURIComponent(sparqlQuery);

    try {
      const response: AxiosResponse<{
        results: {
          bindings: SparqlValueResult[];
        };
      }> = await firstValueFrom(
        this.httpService.get(fullUrl, {
          headers: { Accept: 'application/sparql-results+json' },
        }),
      );

      return response.data?.results?.bindings ?? [];
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack =
        error instanceof Error ? error.stack : 'No stack trace';

      this.logger.error(`SPARQL query failed: ${errorMessage}`, errorStack);

      if (error instanceof AxiosError && error.response) {
        this.logger.error(
          `Response status: ${error.response.status}, data: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw new HttpException(
        `SPARQL query failed: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  /**
   * Default query for looted items in 1868 (Battle of Magdala)
   */
  async queryItems(): Promise<any[]> {
    const cacheKey = 'sparql:queryItems';

    // Try to get from cache first
    const cachedResult = await this.stateService.cacheGet<any[]>(cacheKey);
    if (cachedResult) {
      this.logger.log('Returning cached SPARQL query results');
      return cachedResult;
    }

    const sparqlQuery = `
      SELECT ?item ?itemLabel ?itemDescription
      WHERE {
        ?item p:P793 ?statement.
        ?statement ps:P793 wd:${this.configService.get('wikidata.lootingEventId')}.      # event = looting
        ?statement pq:P585 ?time.
        FILTER(YEAR(?time) = ${this.configService.get('wikidata.lootingEventYear')})
        ?statement pq:P2348 wd:${this.configService.get('wikidata.battleOfMagdalaId')}.     # Battle of Magdala
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
      }
    `;

    const result = await this.runQuery(sparqlQuery);

    // Cache the result for 1 hour (3600 seconds)
    await this.stateService.cacheSet(cacheKey, result, 3600);
    this.logger.log('Cached SPARQL query results');

    return result;
  }

  /**
   * Dynamic query with filters
   */

  async queryItemsWithFilters(
    year?: string,
    timePeriod: string = 'Q947667', // default: Battle of Magdala
  ): Promise<any[]> {
    const cacheKey = `sparql:queryItems:${year || 'all'}:${timePeriod}`;

    // Try to get from cache first
    const cachedResult = await this.stateService.cacheGet<any[]>(cacheKey);
    if (cachedResult) {
      this.logger.log('Returning cached SPARQL query results with filters');
      return cachedResult;
    }

    const filterYear = year ? `FILTER(YEAR(?time) = ${year})` : '';

    const sparqlQuery = `
      SELECT ?item ?itemLabel ?itemDescription
      WHERE {
        ?item p:P793 ?statement.
        ?statement pq:P2348 wd:${timePeriod}.
        ?statement pq:P585 ?time.
        ${filterYear}
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
      }
    `;

    const result = await this.runQuery(sparqlQuery);

    // Cache the result for 1 hour (3600 seconds)
    await this.stateService.cacheSet(cacheKey, result, 3600);
    this.logger.log('Cached SPARQL query results with filters');

    return result;
  }
  async getValuesFromProperty(
    itemId: string,
    propertyId: string,
  ): Promise<SparqlValueResult[]> {
    const sparqlQuery = `
       SELECT DISTINCT
  ?value ?valueLabel
  (STRAFTER(STR(?value), "entity/") AS ?valueQID)
  ?valueDescription
  ?start_time ?end_time ?point_in_time
WHERE {
  VALUES ?item { wd:${itemId} }   # your item
  VALUES ?prop { p:${propertyId} }        # your property (here: "has cause")

  # Find all statements for that property
  ?item ?prop ?statement .
  ?statement ps:${propertyId} ?value .
  
  OPTIONAL { ?value schema:description ?valueDescription. 
             FILTER(LANG(?valueDescription) = "en") }
#   # Extract time qualifiers (if present)
#   OPTIONAL { ?statement pq:P580 ?start_time. }     # start time
#   OPTIONAL { ?statement pq:P582 ?end_time. }       # end time
#   OPTIONAL { ?statement pq:P585 ?point_in_time. }  # point in time

  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
ORDER BY ASC(COALESCE(?point_in_time, ?start_time, ?end_time))
    `;

    // const result = bindings[0]?.itemLabel?.value ?? '';
    return await this.runQuery(sparqlQuery);
  }
}

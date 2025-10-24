import { Controller, Get, Query } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { WikidataService } from 'src/wikidata/wikidata.service';

@Controller('collection')
export class CollectionController {

    constructor(private readonly collectionService: CollectionService, private readonly wikidataService: WikidataService){}

    @Get('items')
    async getLootedItems() {
        return this.collectionService.getLootedItems();
    }

    @Get('filter')
    async getItemsWithFilters(
      @Query('year') year?: number,
      @Query('timePeriod') timePeriod?: string, // handle single or multiple
    ) {
      return this.collectionService.queryItemsWithFilters(year, timePeriod);
    }

    @Get('multiple-values')
    async getMultipleValues(
      @Query('item') item?: string,
      @Query('property') property?: string, // handle single or multiple
    ) {
      const itemId = await this.wikidataService.getEntityIdFromName(item?item:'');
      const propertyId = await this.wikidataService.getEntityIdFromName(property?property:'', 'en', 'property');
      return this.collectionService.getMultipleValue(itemId ?? undefined, propertyId ?? undefined);
    }

    @Get('multiple-props')
    async getMultipleProps(
      @Query('item') item?: string,
   
    ) {
      const itemId = await this.wikidataService.getItemIdFromName(item?item:'');
      return this.collectionService.getMultipeProps(itemId? itemId:'');
    }
}

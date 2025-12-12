import { Controller, Get, Param, Logger } from '@nestjs/common';
import { WikidataService } from './wikidata.service';
import { SparqlService } from './sparql.service';
import { CommonsService } from './commons.service';

@Controller('wikidata')
export class WikidataController {
  private readonly logger = new Logger(WikidataController.name);
  constructor(
    private readonly wikidataService: WikidataService,
    private readonly sparqlService: SparqlService,
    private readonly commonsService: CommonsService,
  ) {}

  @Get('item/:id')
  async getItem(@Param('id') id: string) {
    this.logger.log('Getting single item');
    return this.wikidataService.getItemStatements(id);
  }
  @Get('items')
  async getItems() {
    this.logger.log('Getting items');
    return this.sparqlService.queryItems();
  }

  @Get('image/:name')
  async getImageByName(@Param('name') name: string) {
    this.logger.log('Getting image by name');
    return this.commonsService.getImageByName(name);
  }

  @Get('itemName/:id')
  async getItemName(@Param('id') id: string) {
    this.logger.log(id);
    return this.wikidataService.getItemName(id);
  }
}

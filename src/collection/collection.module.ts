import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { HttpModule } from '@nestjs/axios';
import { WikidataModule } from '../wikidata/wikidata.module';

@Module({
  imports: [HttpModule, WikidataModule],
  providers: [CollectionService],
  controllers: [CollectionController],
  exports: [CollectionService],
})
export class CollectionModule {}

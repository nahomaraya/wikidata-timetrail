import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { HttpModule } from '@nestjs/axios';
import { WikidataModule } from '../wikidata/wikidata.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [HttpModule, WikidataModule],
  providers: [CollectionService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ],
  controllers: [CollectionController],
  exports: [CollectionService]
})
export class CollectionModule {}

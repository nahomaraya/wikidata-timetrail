import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WikidataController } from './wikidata.controller';
import { WikidataService } from './wikidata.service';
import { SparqlService } from './sparql.service';
import { CommonsService } from './commons.service';
import { StateModule } from '../state/state.module';
import { WikidataAuthService } from './wikidata-auth.service';
import { WikidataAuthInterceptor } from './wikidata-auth.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [HttpModule, StateModule],
  providers: [WikidataService, SparqlService, CommonsService,

    WikidataAuthService,
    {
      provide: APP_INTERCEPTOR,
      useClass: WikidataAuthInterceptor, // ✅ scoped to Wikidata module
    },
  ],
  controllers: [WikidataController],
  exports: [WikidataService, SparqlService, CommonsService],
})
export class WikidataModule {}

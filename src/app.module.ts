import { Module, Logger } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonsService } from './commons/commons.service';
import { CollectionService } from './collection/collection.service';
import { CollectionModule } from './collection/collection.module';
import { CommonsModule } from './commons/commons.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import authConfig from './config/auth.config';
import supabaseConfig from './config/supabase.config';
import wikidataConfig from './config/wikidata.config';
import upstashConfig from './config/upstash.config';
import { WikidataModule } from './wikidata/wikidata.module';
import { StateModule } from './state/state.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [authConfig, supabaseConfig, wikidataConfig, upstashConfig],
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..'),
      renderPath: '/',
      serveRoot: '/',
      serveStaticOptions: {
        index: 'index.html',
      },
    }),
    CollectionModule,
    CommonsModule,
    WikidataModule,
    SupabaseModule,
    AuthModule,
    StateModule,
  ],
  controllers: [AppController],
  providers: [AppService, CommonsService, CollectionService, Logger],
})
export class AppModule {}

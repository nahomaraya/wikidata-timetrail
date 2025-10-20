import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
    OnModuleInit,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { HttpService } from '@nestjs/axios';
  import { WikidataAuthService } from './wikidata-auth.service';
  
  @Injectable()
  export class WikidataAuthInterceptor implements NestInterceptor, OnModuleInit {
    private readonly logger = new Logger(WikidataAuthInterceptor.name);
  
    constructor(
      private readonly authService: WikidataAuthService,
      private readonly httpService: HttpService,
    ) {}
  
    async onModuleInit() {
      const axiosRef = this.httpService.axiosRef;
  
      axiosRef.interceptors.request.use(async (config) => {
        const token = await this.authService.getAccessToken();
  
        config.headers = config.headers || {};
        (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
  
        this.logger.debug('Wikidata token attached to outgoing request');
        return config;
      });
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      return next.handle();
    }
  }
  
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{
      cors: true,
      logger: ['error', 'warn', 'log']  
  });
  const config = new DocumentBuilder()
  .setTitle('Wiki Apis')
  .setDescription('some description')
  .setVersion('1.0')
  .addTag('wiki apis')
  .build();
  app.enableCors({
    origin: '*', // or '*' for all origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');
}
bootstrap();

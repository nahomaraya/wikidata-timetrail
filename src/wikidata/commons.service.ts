import { HttpException, Injectable, Logger, StreamableFile } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

export interface CommonsImageInfo {
  filename: string;
  commons_url: string;
  original_url?: string;
  thumbnails?: {
    width: number;
    height: number;
    url: string;
  } | null;
  srcset: string[];
}

@Injectable()
export class CommonsService {
  private readonly logger = new Logger(CommonsService.name);

  constructor(private readonly httpService: HttpService) {}

  async getImageFromP18(
    statements: JSON,
  ): Promise<CommonsImageInfo | { error: string }> {
    // P18 contains the Wikimedia Commons filename
    const p18 = statements['P18']?.[0]?.value?.content;
    if (!p18) {
      this.logger.warn('No P18 property found for item');
      return { error: 'No image available' };
    }

    this.logger.log(`Fetching Commons image for: ${p18}`);
    return this.getImageByName(p18);
  }

  async getImageMetadata(name: string) {
    const commonsUrl = `https://magnus-toolserver.toolforge.org/commonsapi.php?image=${encodeURIComponent(
      name,
    )}`;

    try {
      const response = await lastValueFrom(
        this.httpService.get(commonsUrl, { responseType: 'json' }),
      );
      const imageInfo = response.data?.image?.urls?.file;
      if (!imageInfo) {
        throw new HttpException('No image URL found', 404);
      }

      return {
        filename: name,
        commons_url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
          name,
        )}`,
        image_url: imageInfo,
      };
    } catch (error) {
      this.logger.error(`Error fetching Commons metadata: ${error.message}`);
      throw new HttpException('Failed to fetch Commons metadata', 500);
    }
  }


  async getImageByName(name: string): Promise<CommonsImageInfo | { error: string }> {
    const restApiUrl = `https://commons.wikimedia.org/w/rest.php/v1/file/${encodeURIComponent(
      name,
    )}`;
    this.logger.log("Fetching Commons Image");
    try {
      const response = await lastValueFrom(
        this.httpService.get(restApiUrl, { responseType: 'json' }),
      );
  
      const file = response.data;
  
      if (!file?.preferred) {
        this.logger.warn(`No preferred image found for: ${name}`);
        return { error: 'No image available' };
      }
  
      const srcset = file?.preferred?.srcset?.map((s: any) => `${s.src} ${s.scale}x`) || [];

      return {
        filename: name,
        commons_url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
        original_url: file.preferred?.url, // full-size image
        thumbnails: file.thumbnail ? {
          width: file.thumbnail.width,
          height: file.thumbnail.height,
          url: file.thumbnail.url,
        } : null,
        srcset,
      };
    } catch (error) {
      this.logger.error(`Error fetching Commons image: ${error.message}`);
      return { error: 'Failed to fetch image' };
    }
  }
}

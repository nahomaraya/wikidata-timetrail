import { HttpException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as T from '../interfaces/wikidata.interface';

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

interface CommonsSrcsetItem {
  src: string;
  scale: string;
}

interface CommonsRestApiResponse {
  preferred?: {
    url?: string;
    srcset?: CommonsSrcsetItem[];
  };
  thumbnail?: {
    width: number;
    height: number;
    url: string;
  };
}

interface CommonsToolforgeResponse {
  image?: {
    urls?: {
      file?: string;
    };
  };
}

@Injectable()
export class CommonsService {
  private readonly logger = new Logger(CommonsService.name);

  constructor(private readonly httpService: HttpService) {}

  async getImageFromP18(
    statements: T.WikidataStatementsResponse,
  ): Promise<CommonsImageInfo | { error: string }> {
    const p18Statement = statements['P18']?.[0];

    if (!p18Statement || p18Statement.value.type !== 'string') {
      this.logger.warn('No P18 property found for item');
      return { error: 'No image available' };
    }

    const imageName = p18Statement.value.content;
    this.logger.log(`Fetching Commons image for: ${imageName}`);
    return this.getImageByName(imageName);
  }

  async getImageMetadata(name: string): Promise<{
    filename: string;
    commons_url: string;
    image_url: string;
  }> {
    const commonsUrl = `https://magnus-toolserver.toolforge.org/commonsapi.php?image=${encodeURIComponent(
      name,
    )}`;

    try {
      const response: AxiosResponse<CommonsToolforgeResponse> =
        await lastValueFrom(
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching Commons metadata: ${errorMessage}`);
      throw new HttpException('Failed to fetch Commons metadata', 500);
    }
  }

  async getImageByName(
    name: string,
  ): Promise<CommonsImageInfo | { error: string }> {
    const restApiUrl = `https://commons.wikimedia.org/w/rest.php/v1/file/${encodeURIComponent(
      name,
    )}`;

    this.logger.log('Fetching Commons Image');

    try {
      const response: AxiosResponse<CommonsRestApiResponse> =
        await lastValueFrom(
          this.httpService.get(restApiUrl, { responseType: 'json' }),
        );

      const file = response.data;

      if (!file?.preferred) {
        this.logger.warn(`No preferred image found for: ${name}`);
        return { error: 'No image available' };
      }

      const srcset =
        file.preferred.srcset?.map((s) => `${s.src} ${s.scale}x`) ?? [];

      return {
        filename: name,
        commons_url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
        original_url: file.preferred.url,
        thumbnails: file.thumbnail
          ? {
              width: file.thumbnail.width,
              height: file.thumbnail.height,
              url: file.thumbnail.url,
            }
          : null,
        srcset,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching Commons image: ${errorMessage}`);
      return { error: 'Failed to fetch image' };
    }
  }
}

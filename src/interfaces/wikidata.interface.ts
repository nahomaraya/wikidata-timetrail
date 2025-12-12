// Base types for different value types
export interface WikidataSearchEntity {
  id: string;
  label: string;
  description?: string;
  match?: {
    type: string;
    language: string;
    text: string;
  };
}

export interface WikidataOldFormatStatement {
  mainsnak?: {
    datavalue?: {
      value?: {
        id?: string;
      };
    };
  };
}

export interface WikidataSearchResponse {
  search: WikidataSearchEntity[];
  'search-continue'?: number;
  success: number;
}

export interface LocationInfo {
  locationName: string;
  latitude: string;
  longitude: string;
}

export interface WikidataTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface WikidataEntityDataResponse {
  entities: {
    [entityId: string]: {
      claims?: {
        [propertyId: string]: any[];
      };
    };
  };
}
export interface WikidataTimeObject {
  time: string;
  precision: number;
}

export interface WikidataEntity {
  id: string;
  type: 'item';
  labels?: {
    [languageCode: string]: {
      language: string;
      value: string;
    };
  };
  descriptions?: {
    [languageCode: string]: {
      language: string;
      value: string;
    };
  };
  aliases?: {
    [languageCode: string]: Array<{
      language: string;
      value: string;
    }>;
  };
  sitelinks?: {
    [siteId: string]: {
      site: string;
      title: string;
      badges: string[];
      url: string;
    };
  };
  statements?: WikidataStatementsResponse;
}
export interface WikibaseEntityIdValue {
  type: 'wikibase-entityid';
  content: {
    id: string;
    'entity-type': 'item' | 'property';
  };
}

export interface StringValue {
  type: 'string';
  content: string;
}

export interface TimeValue {
  type: 'time';
  content: {
    time: string;
    precision: number;
    calendarmodel: string;
  };
}

export interface QuantityValue {
  type: 'quantity';
  content: {
    amount: string;
    unit?: string;
  };
}

export interface GlobeCoordinateValue {
  type: 'globecoordinate';
  content: {
    latitude: number;
    longitude: number;
    precision: number;
    globe: string;
  };
}

export interface MonolingualTextValue {
  type: 'monolingualtext';
  content: {
    text: string;
    language: string;
  };
}

type WikidataValue =
  | WikibaseEntityIdValue
  | StringValue
  | TimeValue
  | QuantityValue
  | GlobeCoordinateValue
  | MonolingualTextValue
  | { type: 'novalue' }
  | { type: 'somevalue' };

export interface WikidataQualifier {
  property: {
    id: string;
  };
  value: WikidataValue;
}

export interface WikidataReference {
  parts: Array<{
    property: {
      id: string;
    };
    value: WikidataValue;
  }>;
}

export interface WikidataStatement {
  id: string;
  rank: 'preferred' | 'normal' | 'deprecated';
  property: {
    id: string;
  };
  value: WikidataValue;
  qualifiers?: WikidataQualifier[];
  references?: WikidataReference[];
}

export interface WikidataStatementsResponse {
  [propertyId: string]: WikidataStatement[];
}

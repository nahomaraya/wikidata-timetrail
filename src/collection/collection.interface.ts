export interface Location {
    locationName: string;
    latitude: string;
    longitude: string;
}



export interface Image {
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

export interface Collection {
    id: string;
    name: string;
    desc: string;
    location: Location | null;
    image: Image | { error: string } | null;
}


// Input types for the functions
export interface SparqlItemResult {
  item: {
    value: string;
  };
  itemLabel?: {
    value: string;
  };
  itemDescription?: {
    value: string;
  };
}

export interface SparqlValueResult {
  valueQID?: {
    value: string;
  };
  valueLabel?: {
    value: string;
  };
  valueDescription?: {
    value: string;
  };
}

// Output type for getValueDetails (includes date field)
export interface ValueDetailsResult {
  id: string;
  name: string;
  desc: string;
  location: Location | null;
  date: string | null;
  image: Image | { error: string } | null;
  identifier: string | null;
  wikipediaLinks : any[];
}
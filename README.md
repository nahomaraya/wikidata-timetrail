# Wikidata TimeTrail
**Wikidata TimeTrail** is a tool to build and visualize *timelines* from Wikidata items based on their historical statements.  
It provides both a web service and a mapping tool that lets you explore the life, events, and changes associated with a Wikidata entity (Q-ID).

## Quick Start

1. **Install dependencies:**
```bash
pnpm install
```

2. **Set up environment variables:**
Create a `.env` file with:
```env
WIKIDATA_CLIENT_ID=your_wikidata_client_id
WIKIDATA_CLIENT_SECRET=your_wikidata_client_secret
```

3. **Run the project:**
```bash
# Development
pnpm run start:dev

# Production
pnpm run build
pnpm run start:prod
```

4. **To access:**
```bash
#Web Page
http://localhost:3000

#Swagger Url
http://localhost:3000/api
```



---

## How It Works

1. **Ingest Wikidata Statements**  
   The tool fetches statements about a given Wikidata item via the Wikidata API or dumps (via Toolforge).  
   It looks at date-related properties (e.g., `P580`, `P571`, `P582`) to extract times that matter (birth, creation, dissolution, major events).

2. **Normalize Dates**  
   - Parses different date formats (point-in-time, time spans, qualifiers).  
   - Converts them into a consistent internal representation (e.g., ISO 8601) for timeline visualization.

3. **Event Aggregation & Ordering**  
   - Orders extracted statements chronologically.  
   - Merges overlapping or nested events.  
   - Optionally filters and deduplicates based on configuration (e.g., only “significant” dates, or lowest-level qualifiers).
   - SPARQL query for time-series properties
   - Wikidata REST API query for labels, images, and fallbacks

4. **Geospatial Enrichment**  
   - Uses location-related properties (configured via `LOCATION_IDS` such as `P17`, `P131`, `P625`, etc.).
   - These can also be configured via environment variable
     ```bash
     LOCATION_IDS=P17,P131,P625,P159,P495,P1071,P36
     ```
   - Resolves location Q-IDs to coordinates (if available) or hierarchical parent locations.  
   - Provides geospatial data for mapping on a timeline map view.

5. **Output**
    The API returns JSON such as:
  ```bash
  [{
  "id": "Q1710656",
  "name": "Washington Territory",
  "desc": "Territory of the USA between 1853–1889",
  "location": "Q30",
  "date": "1853-01-01T00:00:00.000Z",
  "image": null,
  "wikipediaLinks": "https://en.wikipedia.org/wiki/Washington_Territory"
}]
```
These can be visualized as snapshots on maps, timelines, or interactive historical explorers.


## Feedback or Suggestions 

Please use the etherpad below for any feedback or suggestions!
https://etherpad.wikimedia.org/p/Wikidata_Timetrail_Feedback

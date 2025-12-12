
# Wikidata TimeTrail

<p align="center">
  <a href="https://etherpad.wikimedia.org/p/Wikidata_Timetrail_Feedback">
    <img src="https://img.shields.io/badge/Feedback-Etherpad-blue?style=for-the-badge&logo=etherpad&logoColor=white" alt="Feedback"/>
  </a>
  <a href="https://toolhub.wikimedia.org/tools/toolforge-wikidata-timetrail">
    <img src="https://img.shields.io/badge/Powered%20by-Toolhub-006699?style=for-the-badge&logo=wikidata&logoColor=white" alt="Toolhub"/>
  </a>
</p>

**Wikidata TimeTrail** is a tool to build and visualize timelines from Wikidata items based on their historical statements. Explore the life, events, and changes associated with any Wikidata entity through an interactive timeline and map view.

**[🚀 Try it Now](https://wikidata-timetrail.toolforge.org/)** | **[📖 Swagger API Docs](https://wikidata-timetrail.toolforge.org/api)**

<p align="center">
  <img src="assets/screenshots/timeline-view.png" alt="Timeline View" width="80%"/>
</p>

## ✨ Features

🗓️ **Timeline Visualization**: Build chronological timelines from any Wikidata Q-ID.

🗺️ **Geospatial Mapping**: View events on an interactive map with location enrichment.

🖼️ **Auto Image Resolution**: Fetches and resolves images from Wikidata statements.

🔍 **SPARQL Integration**: Query time-series properties directly from Wikidata.

📅 **Smart Date Parsing**: Handles multiple date formats, time spans, and qualifiers.

🔗 **Wikipedia Links**: Direct links to related Wikipedia articles for each event.

🎨 **REST API**: Full Swagger documentation for easy integration.

## 🚀 Quick Start

**1. Install dependencies:**
```bash
pnpm install
```

**2. Set up environment variables:**

Create a `.env` file:
```env
WIKIDATA_CLIENT_ID=your_wikidata_client_id
WIKIDATA_CLIENT_SECRET=your_wikidata_client_secret
```

**3. Run the project:**
```bash
# Development
pnpm run start:dev

# Production
pnpm run build
pnpm run start:prod
```

**4. Access the app:**
- 🌐 Web Interface: `http://localhost:3000`
- 📚 Swagger API: `http://localhost:3000/api`


### Location Properties

Customize which location properties are used for geospatial enrichment. The order determines location precision—properties listed first are prioritized for more specific locations.
```bash
LOCATION_IDS=P625,P159,P131,P36,P17
```
| Property | Description |
|----------|-------------|
| `P625` | Coordinate location |
| `P159` | Headquarters location |
| `P131` | Located in administrative entity |
| `P36` | Capital |
| `P17` | Country |


### API Response

```json
{
  "id": "Q1710656",
  "name": "Washington Territory",
  "desc": "Territory of the USA between 1853–1889",
  "location": "Q30",
  "date": "1853-01-01T00:00:00.000Z",
  "image": null,
  "wikipediaLinks": "https://en.wikipedia.org/wiki/Washington_Territory"
}
```

## How It Works

1. **Ingest** – Fetches statements from Wikidata API using date-related properties (`P580`, `P571`, `P582`)
2. **Normalize** – Parses and converts dates to ISO 8601 format
3. **Aggregate** – Orders events chronologically, merges overlapping events, and deduplicates
4. **Enrich** – Resolves location Q-IDs to coordinates for map visualization
5. **Output** – Returns structured JSON for timeline and map rendering

<p align="center">
  <img src="assets/screenshots/map-view.png" alt="Map View" width="80%"/>
</p>

## Contribution

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Feedback & Suggestions

Please share your feedback on our [Etherpad](https://etherpad.wikimedia.org/p/Wikidata_Timetrail_Feedback).

### Acknowledgements

- [Wikidata](https://www.wikidata.org) for providing open access to structured data
- [Wikimedia Toolforge](https://toolforge.org) for hosting and infrastructure support

---

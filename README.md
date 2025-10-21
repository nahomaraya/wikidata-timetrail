# Wikidata TimeTrail

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

4. **Swagger Url:**
```bash
curl http://localhost:3000/api

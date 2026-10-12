# UK Companies House API by CompanyData

[![npm](https://img.shields.io/npm/v/@companydata/companies-house-api.svg)](https://www.npmjs.com/package/@companydata/companies-house-api)

A small, typed TypeScript wrapper for looking up **UK company data from the Companies House register**: company names, full street addresses, phone, email, website, size and revenue, through one REST call.

This package is a thin convenience layer over the master [`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk). It is the same API and the same key, with the country pinned to the United Kingdom and a register-specific helper on top, so you can write `client.getByCompanyNumber("00048839")` instead of assembling query parameters by hand.

> One schema, one key. Every CompanyData register wrapper returns records in the same shape, so moving from Companies House to another country's register is a one-line change.

## At a glance

| | |
| --- | --- |
| Country | 🇬🇧 United Kingdom (`countryCode: "GB"`) |
| Register | UK Companies House register |
| Businesses in CompanyData | 8.85M |
| With phone number | 2.68M |
| With email address | 1.31M |
| Lookup key | company number (8 characters, leading zeros kept) |
| Verified example | Barclays PLC, `00048839` |
| Live demo and comparison | [companydata.com/companies-house-api](https://companydata.com/companies-house-api/) |
| Official register | [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk) |

Counts are from the live API on 2026-10-12 and grow over time.

## What is Companies House?

**Companies House** is the UK registrar of companies. Its free REST API at [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk) returns the registered office, officers, filing history and accounts for a company number, and it is the right source when you need the legal record.

What the Companies House API does **not** give you: no phone number, no email address, no website, no trading address, and no way to filter companies by contact availability, size or revenue. Bulk data comes as a monthly snapshot, not a query.

**CompanyData adds the missing fields.** 8.85M UK businesses with full addresses, phone, email, website, directors and firmographics, filterable and exportable in bulk through one live REST API. Comparison and a live lookup: [companydata.com/companies-house-api](https://companydata.com/companies-house-api/).

## Installation

```bash
npm install @companydata/companies-house-api
```

Get an API key at [app.companydata.com/signup-api](https://app.companydata.com/signup-api). Your first calls are free.

## Quickstart

```ts
import { CompaniesHouseClient } from "@companydata/companies-house-api";

const client = new CompaniesHouseClient({
  auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! }
});

// Look up one business by its company number.
const company = await client.getByCompanyNumber("00048839"); // Barclays PLC

// Search with filters (country is always GB here).
const page = await client.search({
  cityName: "LONDON",
  hasEmail: true,
  hasWebsite: true,
  page: 1,
  pageSize: 25
});
console.log(page.totalCount, page.records[0]?.["Company Name"]);
```

> **City and province names are UPPER CASE.** Filter on `cityName: "LONDON"`, not `"London"` (which returns 0). The same goes for `provinceName: "LONDON"`. List exact names per country with `GET /api/cities`. Full field and filter reference: [companydata.com/api-docs/request-company](https://companydata.com/api-docs/request-company/).

Run the full example against the live API with your key:

```bash
git clone https://github.com/companydatacom/companies-house-api && cd companies-house-api && npm install
COMPANYDATA_API_KEY=... npm run test:live
```

## What a record looks like

Every record is a flat object with human-readable keys. This is Barclays PLC as returned by `getByCompanyNumber`:

```json
{
  "Company Name": "Barclays PLC",
  "Trade Name": "BARCLAYS",
  "Company Registration Number": "00048839",
  "Address 1": "1 Churchill Place",
  "Postal Code": "E14 5HP",
  "City": "Canary Wharf",
  "State/Province": "London",
  "Country": "Unitedkingdom",
  "Phone Number": "+4*****00",
  "Email": "*****@*****",
  "Website": "barclays.*****",
  "Founding Year": 1896,
  "Employees Total": 94700,
  "Yearly Revenue in U.S. Dollars": 72228629736,
  "Business Category Code 1 - Description": "National Commercial Banks",
  "Business Legal Type - Description": "Corporation"
}
```

**Search is a preview, export is the full record.** `search` (and the lookup helper, which uses it) returns about 20 fields with phone, email and website masked as `*****`, and does not spend credits. `export`, `exportWithScroll` and `iterate` return the full record (about 35 fields, unmasked contact details, SIC and national industry codes, legal status, group structure) and spend one credit per company you have not exported before. Which fields are on a record depends on your key's configuration. See the [field reference](https://companydata.com/api-docs/request-company/) and [plans and credits](https://companydata.com/api-docs/authentication/).

## Methods

| Method | Returns | Does |
| --- | --- | --- |
| `client.search(params)` | `CompaniesHousePage` | Search UK businesses with filters. |
| `client.getByCompanyNumber(id, scope?)` | `CompanyRecord \| null` | Fetch one business by company number. `scope` adds extra filters when a number is not unique. |
| `client.export(params)` | `CompaniesHousePage` | Export one page of results (standard pagination). |
| `client.exportWithScroll(params)` | `CompaniesHouseScrollBatch` | One scroll batch (max 50 records). Pass `scrollId` back in for the next. |
| `client.iterate(params, { maxRecords })` | `AsyncGenerator<CompanyRecord>` | Streams every matching record across scroll batches. |
| `client.raw` | `ApiClient` | The underlying master SDK client, for anything not wrapped here. |
| `normalizeCompaniesHouseId(id)` | `string` | The company number normalisation the lookup helper applies. |

```ts
interface CompaniesHousePage {
  records: CompanyRecord[];   // flat objects, keys like "Company Name", "City", "Email"
  totalCount: number;         // matches across all pages
  page: number;
  totalPages: number;
  pageSize: number;
}

interface CompaniesHouseScrollBatch {
  records: CompanyRecord[];
  scrollId: string | null;    // pass back in to get the next batch
  hasMoreRecords: boolean;
  pageSize: number;
}
```

`params` is the master SDK's filter set with `countryCode` removed, because it is always `"GB"` here. For cross-border queries, use the master SDK directly.

### Lookup by company number

`getByCompanyNumber` takes the 8-character Companies House company number. Numeric numbers are left-padded with zeros (`"48839"` becomes `"00048839"`); prefixed numbers such as `SC123456` or `OC301234` are upper-cased and passed as-is.

## Recipes

**Find a company by name, pinned to a city**

```ts
const { records, totalCount } = await client.search({
  search: "Barclays",
  cityName: "LONDON",
  pageSize: 5
});
```

**Build a segment: companies in a province with 50 or more employees**

```ts
const page = await client.search({
  provinceName: "LONDON",
  employeesTotal: { min: 50 },
  hasPhone: true,
  pageSize: 100
});
```

**Stream a whole segment with scroll export**

```ts
for await (const company of client.iterate(
  { cityName: "LONDON", hasEmail: true },
  { maxRecords: 5000 }
)) {
  console.log(company["Company Name"], company["Email"]);
}
```

**Drive the scroll loop yourself**

```ts
let batch = await client.exportWithScroll({ cityName: "LONDON", hasEmail: true, pageSize: 50 });
while (batch.records.length > 0) {
  process(batch.records);
  if (!batch.hasMoreRecords || !batch.scrollId) break;
  batch = await client.exportWithScroll({ cityName: "LONDON", hasEmail: true, scrollId: batch.scrollId, pageSize: 50 });
}
```

**Anything else: drop to the master client**

```ts
const res = await client.raw.company.search({ countryCode: "DE", cityName: "BERLIN", pageSize: 10 });
```

### Common filters

| Filter | Example | Notes |
| --- | --- | --- |
| `search` | `"Barclays"` | Free text over company and trade names. |
| `nationalId` | `"00048839"` | Registration number. The lookup helper sets this for you. |
| `cityName` | `"LONDON"` | UPPER CASE. |
| `provinceName` | `"LONDON"` | Admin-2 name, UPPER CASE (the record's `State/Province`). |
| `postalCode` | `"E14 5HP"` | Exact match. |
| `hasEmail`, `hasPhone`, `hasWebsite` | `true` | Contact availability. |
| `employeesTotal`, `annualSales`, `foundingYears` | `{ min: 50, max: 500 }` | Range filters. |
| `sic4Digits` | `"7372"` | 4-digit SIC industry code. |

Full list: [companydata.com/api-docs/request-company](https://companydata.com/api-docs/request-company/).

## Four ways to integrate

Pick whichever fits how you build. All four hit the same data behind the same key.

1. **This register SDK** (`@companydata/companies-house-api`): UK lookups with a Companies House-specific helper. You are here.
2. **Master SDK** ([`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk)): all 200+ countries in one typed client, keyed by `countryCode`.
3. **MCP server**: connect an AI agent (Claude, Cursor and others) to `https://companydata.com/mcp/` with your key in the `x-api-key` header. See [companydata-mcp-server](https://github.com/companydatacom/companydata-mcp-server).
4. **Raw REST**: call `GET https://app.companydata.com/api/company/search?countryCode=GB&cityName=LONDON` with an `x-api-key` header. Contract: [companydata.com/openapi.json](https://companydata.com/openapi.json).

```bash
curl -H "x-api-key: $COMPANYDATA_API_KEY" \
  "https://app.companydata.com/api/company/search?countryCode=GB&nationalId=00048839&pageSize=1"
```

## Error handling

Failed requests throw `ApiError` with the HTTP status. The client retries transient failures (429 and 5xx) with backoff before giving up.

```ts
import { ApiError } from "@companydata/companies-house-api";

try {
  await client.search({ cityName: "LONDON" });
} catch (err) {
  if (err instanceof ApiError) {
    // 401: bad or missing key, 429: rate limited,
    // "Export credit limit exceeded" (code credits_limit_exceeded): export credits used up
    console.error(err.status, err.message);
  }
}
```

A scroll batch that is larger than your remaining credits is rejected as a whole, so keep `pageSize` small when a key is close to its limit.

## All register wrappers

Same pattern, one per official register. Every wrapper returns the same record shape.

| Country | Register | Package | Lookup helper |
| --- | --- | --- | --- |
| 🇳🇱 Netherlands | KVK | [`@companydata/kvk-api`](https://github.com/companydatacom/kvk-api) | `getByKvkNumber` |
| 🇩🇪 Germany | Handelsregister | [`@companydata/handelsregister-api`](https://github.com/companydatacom/handelsregister-api) | `getByRegistrationNumber` |
| 🇬🇧 United Kingdom | Companies House | [`@companydata/companies-house-api`](https://github.com/companydatacom/companies-house-api) | `getByCompanyNumber` |
| 🇫🇷 France | Sirene | [`@companydata/sirene-api`](https://github.com/companydatacom/sirene-api) | `getBySiret` |
| 🇧🇪 Belgium | KBO/BCE | [`@companydata/kbo-api`](https://github.com/companydatacom/kbo-api) | `getByEnterpriseNumber` |
| 🇵🇱 Poland | KRS | [`@companydata/krs-api`](https://github.com/companydatacom/krs-api) | `getByNip` |
| 🇸🇪 Sweden | Bolagsverket | [`@companydata/bolagsverket-api`](https://github.com/companydatacom/bolagsverket-api) | `getByOrgNumber` |
| 🇨🇭 Switzerland | Zefix | [`@companydata/zefix-api`](https://github.com/companydatacom/zefix-api) | `getByUid` |
| 🇨🇿 Czech Republic | ARES | [`@companydata/ares-api`](https://github.com/companydatacom/ares-api) | `getByIco` |
| 🇩🇰 Denmark | CVR | [`@companydata/cvr-api`](https://github.com/companydatacom/cvr-api) | `getByCvr` |
| 🇧🇷 Brazil | CNPJ | [`@companydata/cnpj-api`](https://github.com/companydatacom/cnpj-api) | `getByCnpj` |
| 🇦🇺 Australia | ABR | [`@companydata/abn-lookup-api`](https://github.com/companydatacom/abn-lookup-api) | `getByAbn` |
| 🇺🇸 United States | SEC EDGAR | [`@companydata/sec-edgar-api`](https://github.com/companydatacom/sec-edgar-api) | `getByRegistrationNumber` |

Plus the master SDK for every other country: [`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk).

## License

MIT. Built and maintained by [CompanyData.com](https://companydata.com).

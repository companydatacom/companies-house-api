/**
 * @companydata/companies-house-api
 *
 * A thin, typed convenience wrapper around the CompanyData API for the
 * UK Companies House register. It is not a separate API: it is the same
 * `@companydata/companydata-sdk` client with the country pinned to GB
 * and a register-specific helper on top, so you can write
 * `client.getByCompanyNumber("00048839")` instead of assembling query parameters.
 *
 * One schema, one key across every CompanyData register. Swap this package for
 * another register wrapper and the shape of what you get back does not change.
 *
 * Docs: https://companydata.com/api-docs/request-company/
 */

import {
  ApiClient,
  type ApiClientConfig,
  type CompanyExportParams,
  type CompanyRecord,
  type CompanySearchParams,
  type RequestOptions
} from "@companydata/companydata-sdk";

/** ISO country code this wrapper is pinned to. */
export const COUNTRY_CODE = "GB" as const;

/**
 * Filters accepted by this wrapper: the master SDK's filter set minus
 * `countryCode`, which is always "GB" here. Use the master SDK directly for
 * cross-border queries.
 *
 * City and province names are matched in UPPER CASE (`cityName: "LONDON"`).
 */
export type CompaniesHouseSearchParams = Omit<CompanySearchParams, "countryCode">;
export type CompaniesHouseExportParams = Omit<CompanyExportParams, "countryCode" | "useScroll">;
export type CompaniesHouseClientConfig = ApiClientConfig;

/** One page of results. Pagination fields are flattened from the API's `meta` block. */
export interface CompaniesHousePage {
  records: CompanyRecord[];
  totalCount: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

/** One batch of a scroll export. Pass `scrollId` back in to fetch the next batch. */
export interface CompaniesHouseScrollBatch {
  records: CompanyRecord[];
  scrollId: string | null;
  hasMoreRecords: boolean;
  pageSize: number;
}

/** Options for `iterate()`. The API returns at most 50 records per scroll batch. */
export interface CompaniesHouseIterateOptions {
  /** Records per request. Capped server-side at 50. */
  pageSize?: number;
  /** Stop after this many records. Omit to pull the whole result set. */
  maxRecords?: number;
}

type RawMeta = {
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  scrollId?: string;
  hasMoreRecords?: boolean;
  recordCount?: number;
};

type RawResponse = {
  meta?: RawMeta;
  data?: CompanyRecord[] | { records?: CompanyRecord[]; totalCount?: number };
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalCount?: number;
  scrollId?: string;
  hasMoreRecords?: boolean;
};

function recordsOf(res: RawResponse): CompanyRecord[] {
  if (Array.isArray(res.data)) return res.data;
  return res.data?.records ?? [];
}

function toPage(res: RawResponse): CompaniesHousePage {
  const records = recordsOf(res);
  const meta = res.meta ?? {};
  const dataTotal = !Array.isArray(res.data) ? res.data?.totalCount : undefined;
  return {
    records,
    totalCount: meta.totalCount ?? res.totalCount ?? dataTotal ?? records.length,
    page: meta.currentPage ?? res.page ?? 1,
    totalPages: meta.totalPages ?? res.totalPages ?? 1,
    pageSize: meta.pageSize ?? res.pageSize ?? records.length
  };
}

function toBatch(res: RawResponse): CompaniesHouseScrollBatch {
  const records = recordsOf(res);
  const meta = res.meta ?? {};
  return {
    records,
    scrollId: meta.scrollId ?? res.scrollId ?? null,
    hasMoreRecords: meta.hasMoreRecords ?? res.hasMoreRecords ?? false,
    pageSize: meta.pageSize ?? res.pageSize ?? records.length
  };
}

/** Normalise a company number to the form the API indexes. */
export function normalizeCompaniesHouseId(id: string): string {
  const clean = id.replace(/\s+/g, "").toUpperCase();
  return /^\d+$/.test(clean) ? clean.padStart(8, "0") : clean;
}

/**
 * Client for UK company data from the UK Companies House register.
 *
 * ```ts
 * const client = new CompaniesHouseClient({ auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! } });
 * const company = await client.getByCompanyNumber("00048839");
 * const page = await client.search({ cityName: "LONDON", hasEmail: true });
 * ```
 */
export class CompaniesHouseClient {
  private readonly api: ApiClient;

  constructor(config: CompaniesHouseClientConfig) {
    this.api = new ApiClient(config);
  }

  /** Search UK businesses. `countryCode` is fixed to "GB". */
  async search(params: CompaniesHouseSearchParams = {}, options?: RequestOptions): Promise<CompaniesHousePage> {
    const res = await this.api.company.search({ ...params, countryCode: COUNTRY_CODE }, options);
    return toPage(res as RawResponse);
  }

  /**
   * Look up a single business by the 8-character Companies House company number.
   * Returns the first matching record, or `null` if none is found.
   *
   * `scope` narrows the lookup with any other filter (for example
   * `{ regionName: "..." }` or `{ cityName: "..." }`) when a number is not
   * unique on its own.
   */
  async getByCompanyNumber(
    id: string,
    scope: CompaniesHouseSearchParams = {},
    options?: RequestOptions
  ): Promise<CompanyRecord | null> {
    const page = await this.search({ ...scope, nationalId: normalizeCompaniesHouseId(id), pageSize: 1 }, options);
    return page.records[0] ?? null;
  }

  /** Export one page of UK businesses (standard pagination). */
  async export(params: CompaniesHouseExportParams = {}, options?: RequestOptions): Promise<CompaniesHousePage> {
    const res = await this.api.company.export({ ...params, countryCode: COUNTRY_CODE }, options);
    return toPage(res as RawResponse);
  }

  /**
   * Export in scroll mode. Call once with your filters, then keep calling with
   * the returned `scrollId` (and the same filters) until `hasMoreRecords` is
   * false. The API returns at most 50 records per batch. `iterate()` does this
   * loop for you.
   */
  async exportWithScroll(
    params: CompaniesHouseExportParams & { scrollId?: string } = {},
    options?: RequestOptions
  ): Promise<CompaniesHouseScrollBatch> {
    const res = await this.api.company.exportWithScroll({ ...params, countryCode: COUNTRY_CODE }, options);
    return toBatch(res as RawResponse);
  }

  /**
   * Stream every record that matches `params`, batch by batch, as an async
   * iterator. Set `maxRecords` to cap the pull.
   *
   * ```ts
   * for await (const company of client.iterate({ cityName: "LONDON", hasEmail: true }, { maxRecords: 500 })) {
   *   console.log(company["Company Name"]);
   * }
   * ```
   */
  async *iterate(
    params: CompaniesHouseSearchParams = {},
    opts: CompaniesHouseIterateOptions = {},
    options?: RequestOptions
  ): AsyncGenerator<CompanyRecord, void, undefined> {
    const pageSize = opts.pageSize ?? 50;
    let scrollId: string | undefined;
    let yielded = 0;
    for (;;) {
      const batch = await this.exportWithScroll(
        scrollId ? { ...params, scrollId, pageSize } : { ...params, pageSize },
        options
      );
      for (const record of batch.records) {
        if (opts.maxRecords !== undefined && yielded >= opts.maxRecords) return;
        yielded += 1;
        yield record;
      }
      if (!batch.hasMoreRecords || batch.records.length === 0 || !batch.scrollId) return;
      scrollId = batch.scrollId;
    }
  }

  /** Escape hatch: the underlying master SDK client, for anything not wrapped here. */
  get raw(): ApiClient {
    return this.api;
  }
}

/** Convenience factory, if you prefer a function to `new`. */
export function createCompaniesHouseClient(config: CompaniesHouseClientConfig): CompaniesHouseClient {
  return new CompaniesHouseClient(config);
}

export { ApiError } from "@companydata/companydata-sdk";
export type {
  ApiClientConfig,
  CompanyExportParams,
  CompanyFilters,
  CompanyRecord,
  CompanySearchParams,
  RangeFilter,
  RequestOptions
} from "@companydata/companydata-sdk";

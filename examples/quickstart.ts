/** Run: COMPANYDATA_API_KEY=... npx tsx examples/quickstart.ts */
import { CompaniesHouseClient } from "../src/index";

const client = new CompaniesHouseClient({ auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! } });

const company = await client.getByCompanyNumber("09469934");
console.log("By company number:", company);

const page = await client.search({ cityName: "London", hasEmail: true, pageSize: 25 });
console.log("Search:", page.data);

import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import postgres from "postgres";
interface IFee {
  value: number;
  contract_address: string;
}
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const sql = postgres(process.env.INDEXA_DB!);
  try {
      const now = new Date(timestamp * 1e3);
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
      const logsTranferERC20: any[] = (await sql`
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 17913327
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 = '\\x000000000000000000000000fdce0267803c6a0d209d3721d2f01fd618e9cbf8'
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `)
      const rawData: IFee[] = logsTranferERC20.map((p: any) => {
        return {
          value: Number(p.value),
          contract_address: p.contract_address
        } as IFee
      });
      const coins = [...new Set(rawData.map((p: any) => `${CHAIN.ETHEREUM}:${p.contract_address}`))];
      const prices = await getPrices(coins, timestamp);
      const dailyFees = rawData.reduce((a: number, b: IFee) => {
        const price = prices[`${CHAIN.ETHEREUM}:${b.contract_address}`].price;
        const decimals = prices[`${CHAIN.ETHEREUM}:${b.contract_address}`].decimals;
        const value = b.value / 10 ** decimals;
        return a + (value * price);
      }, 0);
      sql.end({ timeout: 3 })
      return {
        dailyFees: dailyFees.toString(),
        timestamp
      }
  } catch (error) {
    sql.end({ timeout: 3 })
    console.error(error);
    throw error;
  }

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1693440000,
    }
  }
}
export default adapter;

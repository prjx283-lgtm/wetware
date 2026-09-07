/**
 * Deployment configuration.
 *
 * Chain and feed addresses are the verified Robinhood Chain mainnet values.
 * Everything secret comes from the environment; nothing sensitive lives here.
 */

export interface ChainConfig {
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorer: string;
}

export const ROBINHOOD_MAINNET: ChainConfig = {
  name: 'Robinhood Chain',
  chainId: 4663,
  rpcUrl: process.env.RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
};

export const ROBINHOOD_TESTNET: ChainConfig = {
  name: 'Robinhood Chain Testnet',
  chainId: 46630,
  rpcUrl: process.env.RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com',
};

/**
 * Chainlink equity feeds on Robinhood Chain mainnet, 8 decimals, updating on
 * market hours only. When the market is shut the feed goes stale and the
 * organism goes quiet; that is intended, not a fault.
 */
export const FEEDS = {
  NVDA: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15',
  AAPL: '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0',
  TSLA: '0x4A1166a659A55625345e9515b32adECea5547C38',
  SPY: '0x319724394D3A0e3669269846abE664Cd621f9f6A',
} as const;

export type FeedSymbol = keyof typeof FEEDS;

export interface PosterConfig {
  readonly chain: ChainConfig;
  readonly feedSymbol: FeedSymbol;
  readonly feedAddress: string;
  readonly stateAddress: string;
  /** How often to check the feed for a new round, milliseconds. */
  readonly pollIntervalMs: number;
  /**
   * Post even when the oracle round has not advanced, if this many seconds
   * have passed. Keeps a visible heartbeat over weekends and holidays.
   */
  readonly heartbeatSeconds: number;
  /**
   * First block to scan for recorded states. Zero is always correct and
   * merely slower; the contract's deploy block is the useful value, and it
   * belongs pinned next to the address wherever the address is published.
   */
  readonly fromBlock: number;
}

export function loadConfig(): PosterConfig {
  const network = process.env.NETWORK ?? 'testnet';
  const feedSymbol = (process.env.FEED ?? 'NVDA') as FeedSymbol;

  if (!(feedSymbol in FEEDS)) {
    throw new Error(`unknown feed ${feedSymbol}, expected one of ${Object.keys(FEEDS).join(', ')}`);
  }

  const stateAddress = process.env.STATE_ADDRESS;
  if (!stateAddress) throw new Error('STATE_ADDRESS is required');

  return {
    chain: network === 'mainnet' ? ROBINHOOD_MAINNET : ROBINHOOD_TESTNET,
    feedSymbol,
    feedAddress: process.env.FEED_ADDRESS ?? FEEDS[feedSymbol],
    stateAddress,
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15_000),
    heartbeatSeconds: Number(process.env.HEARTBEAT_SECONDS ?? 900),
    fromBlock: Number(process.env.FROM_BLOCK ?? 0),
  };
}

export const AGGREGATOR_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
] as const;

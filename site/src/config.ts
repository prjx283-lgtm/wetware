/**
 * Where the organism lives. Pinned, not discovered: a page that let the
 * chain tell it which contract to trust would be trusting the wrong thing.
 */

export interface SiteNetwork {
  readonly name: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorer: string;
  readonly symbol: string;
  readonly state: string;
  readonly feed: string;
  /** Deploy block of the state contract. Zero works, it is just slower. */
  readonly fromBlock: number;
}

export const NETWORKS: Record<string, SiteNetwork> = {
  testnet: {
    name: 'Robinhood Chain Testnet',
    chainId: 46630,
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    symbol: 'NVDA',
    state: '0x395E2b16354918e9aA3c9382E42E9de33Efb7EDe',
    // A MockAggregator mirrored from the mainnet NVDA feed, because testnet
    // has no Chainlink equity feeds. Real rounds, real prices, real round ids.
    feed: '0x0D9858cAaeabbe85a82C57d47F43bb5B78199a1A',
    fromBlock: 114823883,
  },
  mainnet: {
    name: 'Robinhood Chain',
    chainId: 4663,
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
    symbol: 'NVDA',
    state: '', // not deployed yet
    feed: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15',
    fromBlock: 0,
  },
};

/** Minutes without a new oracle round before we call the market closed. */
export const STALE_AFTER_MINUTES = 45;

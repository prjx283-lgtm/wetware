/**
 * One-shot deployment of WetwareState.
 *
 *   NETWORK=testnet FEED=NVDA DEPLOYER_PRIVATE_KEY=0x... \
 *     node --experimental-strip-types services/poster/deploy.ts
 */

import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { readFileSync } from 'node:fs';
import { ROBINHOOD_MAINNET, ROBINHOOD_TESTNET, FEEDS, type FeedSymbol } from './config.ts';

const artifact = JSON.parse(
  readFileSync(new URL('../../contracts/out/WetwareState.json', import.meta.url), 'utf8'),
);

async function main(): Promise<void> {
  const chain = (process.env.NETWORK ?? 'testnet') === 'mainnet' ? ROBINHOOD_MAINNET : ROBINHOOD_TESTNET;
  const feedSymbol = (process.env.FEED ?? 'NVDA') as FeedSymbol;
  const feedAddress = process.env.FEED_ADDRESS ?? FEEDS[feedSymbol];
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required');
  if (!feedAddress) throw new Error(`no feed address for ${feedSymbol}`);

  const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId);
  const wallet = new Wallet(privateKey, provider);
  const poster = process.env.POSTER_ADDRESS ?? wallet.address;

  console.log(`deploying to ${chain.name} (${chain.chainId})`);
  console.log(`  feed   ${feedSymbol} ${feedAddress}`);
  console.log(`  poster ${poster}`);

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(feedAddress, poster);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\ndeployed WetwareState at ${address}`);
  console.log(`${chain.explorer}/address/${address}`);
  console.log(`\nexport STATE_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Deploy a MockAggregator to testnet.
 *
 * Robinhood Chain testnet has no Chainlink equity feeds, so the testnet
 * rehearsal feeds the organism from a mock that mirror.ts fills with real
 * mainnet rounds. This refuses to run against mainnet on purpose: mainnet has
 * the real feeds and the organism there must eat from them, or the whole
 * verification story is hollow.
 *
 *   NETWORK=testnet DEPLOYER_PRIVATE_KEY=0x... npm run deploy:mock
 */

import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { readFileSync } from 'node:fs';
import { ROBINHOOD_TESTNET } from './config.ts';

const artifacts = JSON.parse(
  readFileSync(new URL('../../contracts/out/artifacts.json', import.meta.url), 'utf8'),
);

async function main(): Promise<void> {
  const network = process.env.NETWORK ?? 'testnet';
  if (network !== 'testnet') {
    throw new Error('MockAggregator is a testnet stand-in only. Mainnet has real Chainlink feeds; use those.');
  }
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error('DEPLOYER_PRIVATE_KEY is required');

  const provider = new JsonRpcProvider(ROBINHOOD_TESTNET.rpcUrl, ROBINHOOD_TESTNET.chainId);
  const wallet = new Wallet(privateKey, provider);

  console.log(`deploying MockAggregator to ${ROBINHOOD_TESTNET.name} (${ROBINHOOD_TESTNET.chainId})`);
  console.log(`  deployer ${wallet.address}`);

  const factory = new ContractFactory(artifacts.MockAggregator.abi, artifacts.MockAggregator.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\ndeployed MockAggregator at ${address}`);
  console.log(`${ROBINHOOD_TESTNET.explorer}/address/${address}`);
  console.log(`\nexport FEED_ADDRESS=${address}`);
  console.log('\nNote: setRound on the mock is open to anyone. That is fine for a rehearsal and');
  console.log('would be unacceptable anywhere else, which is why this script refuses mainnet.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * WetwareState behaviour, run against a real EVM.
 *
 * The property worth proving here is the one the whole trust model rests on:
 * a poster cannot lie about the price. Everything else is bookkeeping.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVM, runTx } from '@ethereumjs/vm';
import { createLegacyTx } from '@ethereumjs/tx';
import { Address, hexToBytes, bytesToHex, createAddressFromPrivateKey, createAccount } from '@ethereumjs/util';
import { Interface, AbiCoder } from 'ethers';
import { readFileSync } from 'node:fs';

const artifacts = JSON.parse(readFileSync(new URL('../out/artifacts.json', import.meta.url)));

const OWNER_KEY = hexToBytes('0x' + '11'.repeat(32));
const OTHER_KEY = hexToBytes('0x' + '22'.repeat(32));

const stateIface = new Interface(artifacts.WetwareState.abi);
const mockIface = new Interface(artifacts.MockAggregator.abi);
const coder = AbiCoder.defaultAbiCoder();

async function setup() {
  const vm = await createVM();
  const owner = createAddressFromPrivateKey(OWNER_KEY);
  const other = createAddressFromPrivateKey(OTHER_KEY);

  for (const addr of [owner, other]) {
    await vm.stateManager.putAccount(addr, createAccount({ balance: 10n ** 20n }));
  }

  const nonces = { [owner.toString()]: 0n, [other.toString()]: 0n };

  async function send(key, from, to, data, expectRevert = false) {
    const tx = createLegacyTx({
      to: to ?? undefined,
      data: hexToBytes(data),
      gasLimit: 8_000_000n,
      gasPrice: 10n,
      nonce: nonces[from.toString()]++,
      value: 0n,
    }).sign(key);
    const result = await runTx(vm, { tx, skipBalance: true, skipBlockGasLimitValidation: true });
    const err = result.execResult.exceptionError;
    if (!expectRevert && err) {
      throw new Error(`unexpected revert: ${err.error} ${bytesToHex(result.execResult.returnValue)}`);
    }
    return {
      reverted: Boolean(err),
      returnValue: bytesToHex(result.execResult.returnValue),
      createdAddress: result.createdAddress,
      logs: result.execResult.logs ?? [],
    };
  }

  async function call(to, data) {
    const result = await vm.evm.runCall({
      to: new Address(to.bytes),
      data: hexToBytes(data),
      gasLimit: 8_000_000n,
      caller: owner,
      origin: owner,
    });
    return bytesToHex(result.execResult.returnValue);
  }

  return { vm, owner, other, send, call };
}

async function deployAll(env) {
  const mock = await env.send(OWNER_KEY, env.owner, null, artifacts.MockAggregator.bytecode);
  const args = coder.encode(['address', 'address'], [mock.createdAddress.toString(), env.owner.toString()]);
  const state = await env.send(OWNER_KEY, env.owner, null, artifacts.WetwareState.bytecode + args.slice(2));
  return { mock: mock.createdAddress, state: state.createdAddress };
}

function postCall(over = {}) {
  const p = {
    tick: 100, roundId: 1, answer: 17_850_000_000n, x: 5, y: -3,
    heading: 900, leftMuscle: 42, rightMuscle: 17,
    stateHash: '0x' + 'ab'.repeat(32), ...over,
  };
  return stateIface.encodeFunctionData('postState', [
    p.tick, p.roundId, p.answer, p.x, p.y, p.heading, p.leftMuscle, p.rightMuscle, p.stateHash,
  ]);
}

const setRound = (env, mock, id, answer) =>
  env.send(OWNER_KEY, env.owner, mock, mockIface.encodeFunctionData('setRound', [id, answer, 1_757_000_000n]));

test('a poster cannot report a price the feed does not confirm', async () => {
  const env = await setup();
  const { mock, state } = await deployAll(env);
  await setRound(env, mock, 1, 17_850_000_000n);

  const lying = await env.send(OWNER_KEY, env.owner, state, postCall({ answer: 19_635_000_000n }), true);
  assert.ok(lying.reverted, 'a mismatched price must revert');
  assert.ok(lying.returnValue.startsWith(stateIface.getError('PriceMismatch').selector),
    `expected PriceMismatch, got ${lying.returnValue}`);

  const honest = await env.send(OWNER_KEY, env.owner, state, postCall());
  assert.ok(!honest.reverted);
});

test('a round the feed never answered is rejected', async () => {
  const env = await setup();
  const { state } = await deployAll(env);
  const res = await env.send(OWNER_KEY, env.owner, state, postCall({ roundId: 7, answer: 0n }), true);
  assert.ok(res.reverted);
  assert.ok(res.returnValue.startsWith(stateIface.getError('RoundNotAnswered').selector));
});

test('only the poster can post', async () => {
  const env = await setup();
  const { mock, state } = await deployAll(env);
  await setRound(env, mock, 1, 17_850_000_000n);
  const res = await env.send(OTHER_KEY, env.other, state, postCall(), true);
  assert.ok(res.reverted);
  assert.ok(res.returnValue.startsWith(stateIface.getError('NotPoster').selector));
});

test('rounds cannot go backwards', async () => {
  const env = await setup();
  const { mock, state } = await deployAll(env);
  await setRound(env, mock, 1, 17_850_000_000n);
  await setRound(env, mock, 2, 17_900_000_000n);
  await env.send(OWNER_KEY, env.owner, state, postCall({ roundId: 2, answer: 17_900_000_000n, tick: 200 }));
  const replay = await env.send(OWNER_KEY, env.owner, state, postCall({ roundId: 1, answer: 17_850_000_000n }), true);
  assert.ok(replay.reverted);
  assert.ok(replay.returnValue.startsWith(stateIface.getError('StaleRound').selector));
});

test('state reads back exactly as posted, and deltas are derived', async () => {
  const env = await setup();
  const { mock, state } = await deployAll(env);
  await setRound(env, mock, 1, 17_850_000_000n);
  await setRound(env, mock, 2, 18_000_000_000n);

  await env.send(OWNER_KEY, env.owner, state, postCall({ roundId: 1, answer: 17_850_000_000n, x: 5, y: -3 }));
  const second = await env.send(OWNER_KEY, env.owner, state,
    postCall({ roundId: 2, answer: 18_000_000_000n, tick: 250, x: 12, y: -10 }));

  const log = second.logs[0];
  const event = stateIface.parseLog({ topics: log[1].map(bytesToHex), data: bytesToHex(log[2]) });
  assert.equal(event.name, 'WetwareStateUpdated');
  assert.equal(event.args.deltaX, 7n, 'deltaX should be 12 - 5');
  assert.equal(event.args.deltaY, -7n, 'deltaY should be -10 - -3');

  const [s] = stateIface.decodeFunctionResult('getState',
    await env.call(state, stateIface.encodeFunctionData('getState', [])));
  assert.equal(s.tick, 250n);
  assert.equal(s.roundId, 2n);
  assert.equal(s.x, 12n);
  assert.equal(s.heading, 900n);

  const muscles = stateIface.decodeFunctionResult('getMuscles',
    await env.call(state, stateIface.encodeFunctionData('getMuscles', [])));
  assert.equal(muscles[0], 42n);
  assert.equal(muscles[1], 17n);
});

test('poke works once, then is on cooldown', async () => {
  const env = await setup();
  const { state } = await deployAll(env);
  const first = await env.send(OTHER_KEY, env.other, state, stateIface.encodeFunctionData('poke', []));
  assert.ok(!first.reverted, 'anyone may poke');
  const second = await env.send(OTHER_KEY, env.other, state, stateIface.encodeFunctionData('poke', []), true);
  assert.ok(second.reverted, 'second poke inside the cooldown must revert');
  assert.ok(second.returnValue.startsWith(stateIface.getError('PokeTooSoon').selector));
});

test('setPoster is disabled once an attestation verifier is configured', async () => {
  const env = await setup();
  const { state } = await deployAll(env);
  const pcrs = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];

  const before = await env.send(OWNER_KEY, env.owner, state,
    stateIface.encodeFunctionData('setPoster', [env.other.toString()]));
  assert.ok(!before.reverted, 'owner may rotate the poster in v1');

  await env.send(OWNER_KEY, env.owner, state,
    stateIface.encodeFunctionData('setVerifier', [env.other.toString(), pcrs]));

  const after = await env.send(OWNER_KEY, env.owner, state,
    stateIface.encodeFunctionData('setPoster', [env.owner.toString()]), true);
  assert.ok(after.reverted, 'after v2 the owner must not be able to hand over the organism');
});

test('ownership can be renounced, permanently', async () => {
  const env = await setup();
  const { state } = await deployAll(env);
  await env.send(OWNER_KEY, env.owner, state, stateIface.encodeFunctionData('renounceOwnership', []));
  const res = await env.send(OWNER_KEY, env.owner, state,
    stateIface.encodeFunctionData('setPoster', [env.other.toString()]), true);
  assert.ok(res.reverted);
  assert.ok(res.returnValue.startsWith(stateIface.getError('OwnershipRenounced').selector));
});

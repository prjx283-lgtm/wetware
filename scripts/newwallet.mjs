/**
 * Generate a fresh wallet for the poster.
 *
 * This key signs state updates and nothing else. It should hold only enough
 * gas to post, and it should never be a wallet you keep funds in. Printed once
 * here and never stored by this script.
 */

import { Wallet } from 'ethers';

const wallet = Wallet.createRandom();

console.log('');
console.log('  A new wallet for the worm');
console.log('  ---------------------------------------------------------------');
console.log('  ADDRESS      ', wallet.address);
console.log('  PRIVATE KEY  ', wallet.privateKey);
console.log('  ---------------------------------------------------------------');
console.log('');
console.log('  Save the private key somewhere safe and private.');
console.log('  Never paste it into a chat, a website, or a screenshot.');
console.log('  Fund the address with a small amount of gas, nothing more.');
console.log('');

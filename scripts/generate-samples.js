import { createAddressFromPrivateKey, generatePrivateKey } from '../src/core/address.js';

for (const chain of ['TRX', 'ETH']) {
  console.log(`${chain}:`);
  for (let i = 0; i < 5; i += 1) {
    const privateKey = generatePrivateKey();
    const wallet = createAddressFromPrivateKey(chain, privateKey);
    console.log(`${i + 1}. ${wallet.address}`);
  }
}

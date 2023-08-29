Implementation of contracts for [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) account abstraction via alternative mempool.

# Vechain Specific Changes
The changes mainly concern VTHO support, as the gas unit that is refunded.

# Test
Deploy the contracts with:
```bash
yarn hardhat test --network vechain test/deploy-contracts.test.ts
```

Update [./test/config.ts](./test/config.ts) with the addresses of the deployed contracts and

```bash
yarn hardhat test
```

# Resources
- [Vitalik's post on account abstraction without Ethereum protocol changes](https://medium.com/infinitism/erc-4337-account-abstraction-without-ethereum-protocol-changes-d75c9d94dc4a)
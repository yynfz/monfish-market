# MonFish-Market contracts

Setup (deps are not vendored):

```sh
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
forge test
```

Deploy + seed to Monad testnet (needs `contracts/.env` with `SELLER_PRIVATE_KEY`,
`BUYER_ADDRESS`, `RPC_URL`, and the seller key funded ~15 MON):

```sh
../scripts/deploy.sh
```

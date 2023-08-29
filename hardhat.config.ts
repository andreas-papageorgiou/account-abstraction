import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/config'
import 'hardhat-deploy'
import '@nomiclabs/hardhat-etherscan'

import '@nomiclabs/hardhat-truffle5'
import { VECHAIN_URL_SOLO } from '@vechain/hardhat-vechain'
import '@vechain/hardhat-ethers'
import '@vechain/hardhat-web3'

const optimizedComilerSettings = {
  version: '0.8.17',
  settings: {
    optimizer: { enabled: true, runs: 1000000 }
  }
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.15',
      settings: {
        optimizer: { enabled: true, runs: 1000000 }
      }
    }]
  },
  networks: {
    vechain: {
      url: VECHAIN_URL_SOLO
    }
  },
  mocha: {
    timeout: 180000
  },
}


export default config

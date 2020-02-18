require('dotenv').config()

const HDWalletProvider = require('truffle-hdwallet-provider')

module.exports = {
  networks: {
    ropsten: {
      provider: () => new HDWalletProvider(process.env.WALLET_MNEMONIC, `https://ropsten.infura.io/v3/${process.env.INFURA_KEY}`),
      network_id: 3,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },

    kovan: {
      provider: () => new HDWalletProvider(process.env.WALLET_MNEMONIC, `https://kovan.infura.io/v3/${process.env.INFURA_KEY}`),
      network_id: 42,
      gas: 4700000,
      gasPrice: 5000000000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
      // from: '0xe80d6342055243E72b9F2e566dB9149BEbfe0c74'
    }
  },
  mocha: {
    // timeout: 100000
  },
  compilers: {
    solc: {
      // version: "0.5.8",    // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: { // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 100000
        }
      //  evmVersion: "byzantium"
      }
    }
  },
  plugins: [
    'truffle-plugin-verify'
  ],
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY
  }
}

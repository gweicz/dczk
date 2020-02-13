require('dotenv').config({ path: '../.env' })

const Web3 = require('web3')
const HDWalletProvider = require('truffle-hdwallet-provider')
const fetch = require('node-fetch')

const versions = require('../dapp/src/versions')
const v = Object.keys(versions)[0]
const version = versions[v]
const abi = version.abi
const addr = version.dczk
const srcUrl = 'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=DAI&tsyms=CZK'
const srcPath = 'RAW.DAI.CZK.PRICE'

async function run () {
  const web3 = new Web3(new HDWalletProvider(process.env.WALLET_MNEMONIC, `https://kovan.infura.io/v3/${process.env.INFURA_KEY}`))
  const accounts = await web3.eth.getAccounts()
  const net = await web3.eth.net.getNetworkType()
  const user = accounts[0]
  const balance = web3.utils.fromWei(await web3.eth.getBalance(user))
  console.log(`Network: ${net}`)
  console.log(`Account: ${user}`)
  console.log(`Balance: ${balance} ETH`)
  console.log(`Contract: ${addr} [v${v}]`)
  console.log('---')

  const contract = new web3.eth.Contract(abi, addr)

  async function getRate () {
    const json = await fetch(srcUrl).then(r => r.json())
    return Math.round(Number(eval(`json.${srcPath}`)) * 100) / 100
  }

  async function updateRate (rate) {
    const val = web3.utils.toWei(String(rate))
    console.log(`Updating rate: ${rate} [${val}]`)
    contract.methods.updateRate(val).send({ from: user })
      .then(tx => {
        console.log(`DONE ---> tx: ${tx.transactionHash}`)
      })
  }

  // run every 60 minutes
  setInterval(async () => getRate().then(updateRate), 1000 * 60 * 60)
  // first run
  updateRate(await getRate())
}

run()

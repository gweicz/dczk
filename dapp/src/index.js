/* global Web3, web3, ethereum */

const m = require('mithril')
// const Web3 = require('web3')
const numeral = require('numeral')
const dateFns = require('date-fns')
const { cs } = require('date-fns/locale')
const semver = require('semver')

// settings
const versions = require('./versions')

let currentVersion = Object.keys(versions)[0]

const ERC20 = require('./abi/ERC20.json')
const sourceLink = 'https://github.com/gweicz/dCZK/blob/master/contracts/DCZK.sol'

const contracts = {
  DCZK: {},
  Pot: {
    abi: require('./abi/Pot.json'),
    address: '0xEA190DBDC7adF265260ec4dA6e9675Fd4f5A78bb'
  },
  DAI: {
    abi: ERC20,
    address: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa'
  },
  ETH: {}
}

const tokens = {
  DCZK: {
    symbol: 'dCZK',
    contract: 'DCZK'
  },
  DAI: {
    symbol: 'DAI',
    contract: 'DAI'
  },
  ETH: {
    symbol: 'ETH',
    contract: 'ETH',
    approve: false,
    dp: 4
  }
}

let noWeb3 = null
let badNetwork = null
const state = {}
function updateState (key) {
  return (el) => {
    if (!el.target.value.match(/^\d+\.?\d*$/) && el.target.value !== '') {
      // state[key] = null
      return false
    }
    state[key] = el.target.value
    if (key === 'buy') {
      state.sell = ''
    }
    if (key === 'sell') {
      state.buy = ''
    }
  }
}

let data = {}
resetData()
function resetData () {
  data = {
    balances: {},
    allowances: {},
    rates: [],
    updates: [],
    orders: []
  }
  return data
}

const MAX_INT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

function num (n, dp = 2) {
  const mp = 10 ** dp
  const min = mp / (10 ** (2 * dp))
  if (Number(n) !== 0 && Number(n) > 0 && Number(n) < min) {
    return `< ${min}`
  }
  if (Number(n) === 0) {
    return String(0)
  }
  // const val = Math.floor(Number(n) * mp) / mp
  return numeral(n).format(`0,0.${'0'.repeat(dp)}`)
}

function fa (str) {
  return m('i', { class: str })
}

class DCZK {
  constructor (accounts, version) {
    // set version
    this.version = version
    this.versionData = versions[this.version]
    console.log(`dCZK version ${this.version}`)
    contracts.DCZK.address = this.versionData.dczk
    contracts.DCZK.abi = this.versionData.abi
    // tokens.DCZK.symbol = 'dCZK' + this.version.replace('.', '')

    this.accounts = accounts
    this.user = this.accounts[0]
    this.dczk = this._contract()
    this.pot = this._contract('Pot')
    this.dai = this._contract('DAI')
    this.fee = 400

    this.subs = []
    const sub = web3.eth.subscribe('logs', {
      address: [
        contracts.DCZK.address,
        contracts.DAI.address
      ]
    }, (err, res) => {
      this.refresh()
    })
    this.subs.push(sub)
    this.interval = setInterval(() => this.refresh(), 1000 * 30)
    this.BN = web3.utils.BN
    this.fromWei = web3.utils.fromWei
    this.toWei = web3.utils.toWei
    this.ONE = new this.BN(this.toWei('1'))
  }

  init () {
    return new Promise(resolve => {
      web3.eth.net.getNetworkType((err, net) => {
        if (net !== 'kovan') {
          badNetwork = true
          return resolve(false)
        } else {
          badNetwork = false
        }
        resolve(true)
      })
    })
  }

  async exit () {
    for (const s of this.subs) {
      await s.unsubscribe()
    }
    clearInterval(this.interval)
  }

  _contract (name = 'DCZK') {
    const c = contracts[name]
    return new web3.eth.Contract(c.abi, c.address)
  }

  _dsr (rate) {
    return (1 * (Number(web3.utils.fromWei(rate, 'gether')) ** 31536000) - 1) * 100
  }

  threads () {
    const rts = []
    return this.dczk.methods.maxRate().call().then(maxRate => {
      const getRate = (rate) => {
        if (rate === '0') {
          return null
        }
        return this.dczk.methods.txs(rate).call().then(res => {
          rts.push({ rate: web3.utils.fromWei(rate), amount: web3.utils.fromWei(res.amount) })
          if (res.next) {
            return getRate(res.next)
          }
        })
      }
      return getRate(maxRate)
    }).then(() => {
      data.rates = rts.sort((x, y) => Number(x.rate) < Number(y.rate) ? 1 : -1)
      m.redraw()
    })
  }

  totalLiquidity (rates = null) {
    const rts = rates || data.rates
    if (rts === 0) {
      return 0
    }
    let dai = new this.BN('0')
    let dczk = new this.BN('0')
    for (const r of rts) {
      const rate = new this.BN(this.toWei(r.rate))
      const amount = new this.BN(this.toWei(r.amount))
      dai = dai.add(amount)
      dczk = dczk.add(amount.mul(rate).div(this.ONE))
    }
    const out = { dai: this.fromWei(dai), dczk: this.fromWei(dczk) }
    out.rate = this.calcRate(out.dai, out.dczk)
    return out
  }

  setAllowance (cn, n = null) {
    return async () => {
      // const k = `${cn}_approve`
      // const v = state[k]
      const val = n !== null ? n : new web3.utils.BN(MAX_INT)
      const opts = {
        from: this.user
      }
      const tx = await this[cn.toLowerCase()].methods.approve(contracts.DCZK.address, val).send(opts)
      console.log(tx)
      // state[k] = null
    }
  }

  rateUpdates () {
    return web3.eth.getBlockNumber((err, block) => {
      return this.dczk.getPastEvents('RateUpdate', { fromBlock: block - 10000 }, (err, logs) => {
        return Promise.all(logs.map(l => {
          return web3.eth.getBlock(l.blockNumber).then(block => {
            return {
              block: l.blockNumber,
              time: new Date(block.timestamp * 1000),
              rate: web3.utils.fromWei(l.returnValues.rate),
              caller: l.returnValues.caller,
              txid: l.transactionHash
            }
          })
        })).then((updates) => {
          data.updates = updates.sort((x, y) => x.block < y.block ? 1 : -1)
        })
      })
    })
  }

  lastOrders () {
    function getOrder (l, type) {
      return web3.eth.getBlock(l.blockNumber).then(block => {
        return {
          type,
          dczk: web3.utils.fromWei(l.returnValues.czk ? l.returnValues.czk : l.returnValues.dczk),
          dai: web3.utils.fromWei(l.returnValues.dai),
          user: l.returnValues.seller || l.returnValues.buyer,
          block: l.blockNumber,
          time: new Date(block.timestamp * 1000),
          txid: l.transactionHash
        }
      })
    }
    function addOrders (logs, type) {
      return Promise.all(logs.map(l => {
        return getOrder(l, type).then(item => {
          return item
        })
      }))
    }
    return web3.eth.getBlockNumber().then(block => {
      return Promise.all([
        this.dczk.getPastEvents('Buy', { fromBlock: block - 50000 }).then(logs => {
          return addOrders(logs, 'buy')
        }),
        this.dczk.getPastEvents('Sell', { fromBlock: block - 50000 }).then(logs => {
          return addOrders(logs, 'sell')
        })
      ]).then(orders => {
        data.orders = [].concat.apply([], orders).sort((x, y) => x.block > y.block ? -1 : 1)
        m.redraw()
      })
    })
  }

  buy () {
    return () => {
      const val = web3.utils.toWei(state.buy)
      this.dczk.methods.buy(val).send({ from: this.user }, (err, result) => { console.log(result) })
      state.buy = null
    }
  }

  updatedRates (rts, buy, sell) {
    const out = JSON.parse(JSON.stringify(rts))
    if (Number(buy) > 0) {
      const r = out.find(rt => Number(rt.rate) === Number(data.rate))
      const n = this.priceWithoutFeeBN(buy)
      if (!r) {
        out.push({ rate: data.rate, amount: this.fromWei(n), created: true })
      }
      if (r) {
        r.amount = this.fromWei(n.add(new this.BN(this.toWei(r.amount))))
        r.added = this.fromWei(n)
      }
    }
    if (Number(sell) > 0) {
      const res = this.calcSellPrice(sell)[1]
      if (res) {
        for (const r of out) {
          const ch = res.find(ri => Number(ri.rate) === Number(r.rate))
          if (ch && ch.removed) {
            r.removed = true
          }
          if (ch && ch.subtracted) {
            r.subtracted = ch.subtracted
          }
        }
      }
    }
    // console.log(out, data.buy, data.sell)
    return out.sort((x, y) => Number(x.rate) < Number(y.rate) ? 1 : -1)
  }

  priceWithoutFeeBN (n) {
    const val = new this.BN(this.toWei(n))
    const fee = val.div(new this.BN(this.fee))
    const rest = val.sub(fee)
    return rest
  }

  buyPrice (n) {
    if (!this.checkInputNumber(n)) {
      return -2
    }
    if (n <= 0) {
      return 0
    }
    const rest = this.priceWithoutFeeBN(n)

    const rate = new this.BN(this.toWei(data.rate))
    const out = rest.mul(rate).div(this.ONE)

    return this.fromWei(out)
  }

  checkInputNumber (n) {
    return n.match(/^\d+(\.\d{0,18})?$/)
  }

  calcSellPrice (n) {
    if (!data.rates) {
      return [0]
    }
    if (!this.checkInputNumber(n)) {
      return [-2]
    }
    const rts = [].concat(data.rates)
    const changes = []
    const zero = new this.BN('0')

    let amount = new this.BN(this.toWei(n))
    let deposit = zero.clone()

    let currentRate = rts.shift()

    while (amount.gt(zero)) {
      const nextRate = rts.shift()
      const currentRateBN = new this.BN(this.toWei(currentRate.rate))
      const currentRateAmount = new this.BN(this.toWei(currentRate.amount))
      const full = currentRateAmount.mul(currentRateBN).div(this.ONE)
      // console.log(currentRate, currentRateBN.toString(), currentRateAmount.toString(), full.toString(), amount.toString(), full.gt(amount))
      /* if (full.sub(amount).lt(zero)) {
        return -1
      } */
      if (full.gt(amount)) {
        const partialAmount = amount.mul(this.ONE).div(currentRateBN)
        deposit = deposit.add(partialAmount)
        amount = new this.BN('0')
        changes.push({ rate: currentRate.rate, subtracted: this.fromWei(partialAmount) })
      } else {
        amount = amount.sub(full)
        deposit = deposit.add(currentRateAmount)
        changes.push({ rate: currentRate.rate, removed: true })
      }
      if (nextRate) {
        currentRate = nextRate
      }
      if (!nextRate && amount.gt(new this.BN(0))) {
        return [-1, changes]
      }
    }
    return [this.fromWei(deposit), changes]
  }

  sellPrice (n) {
    return this.calcSellPrice(n)[0]
  }

  calcRate (x, y) {
    if (x <= 0 || y <= 0) {
      return 0
    }
    const _x = new this.BN(this.toWei(x))
    const _y = new this.BN(this.toWei(y))
    return this.fromWei(_y.mul(this.ONE).div(_x))
  }

  calcRateTargetAmount (rate, amount) {
    const r = new this.BN(this.toWei(rate))
    const am = new this.BN(this.toWei(amount))
    return this.fromWei(am.mul(r).div(this.ONE))
  }

  sell () {
    return () => {
      const val = web3.utils.toWei(state.sell)
      this.dczk.methods.sell(val).send({ from: this.user }, (err, result) => { console.log(result) })
      state.sell = null
    }
  }

  add (x, y) {
    return this.fromWei(new this.BN(this.toWei(x)).add(new this.BN(this.toWei(y))))
  }

  sub (x, y) {
    return this.fromWei(new this.BN(this.toWei(x)).sub(new this.BN(this.toWei(y))))
  }

  data () {
    return Promise.all([
      this.dczk.methods.totalSupply().call((err, result) => { data.totalSupply = web3.utils.fromWei(result) }),
      this.dczk.methods.potSupply().call((err, result) => { data.potSupply = web3.utils.fromWei(result) }),
      this.dczk.methods.rate().call((err, result) => { data.rate = web3.utils.fromWei(result) }),
      this.dczk.methods.totalVolume().call((err, result) => { data.totalVolume = web3.utils.fromWei(result) }),
      this.dczk.methods.potDrip().call((err, result) => { data.potDrip = web3.utils.fromWei(result) }),
      this.pot.methods.dsr().call((err, result) => { data.savingRate = this._dsr(result) }),
      this.dai.methods.balanceOf(this.user).call((err, result) => { data.balances.DAI = web3.utils.fromWei(result) }),
      this.dai.methods.allowance(this.user, contracts.DCZK.address).call((err, result) => { data.allowances.DAI = web3.utils.fromWei(result) }),
      this.dczk.methods.balanceOf(this.user).call((err, result) => { data.balances.DCZK = web3.utils.fromWei(result) }),
      this.dczk.methods.allowance(this.user, contracts.DCZK.address).call((err, result) => { data.allowances.DCZK = web3.utils.fromWei(result) }),
      new Promise(() => { data.fee = (1 / this.fee) * 100 }),
      web3.eth.getBalance(this.user).then(res => { data.balances.ETH = web3.utils.fromWei(res) }),
      this.dai.methods.balanceOf(contracts.DCZK.address).call((err, result) => { data.feeTreasury = web3.utils.fromWei(result) }),
      new Promise(() => {
        if (this.version && semver.gte(String('0.' + this.version), '0.0.1')) {
          return this.dczk.methods.lastUpdate().call((err, result) => { data.lastUpdate = new Date(result * 1000) })
        }
      })
    ]).then(() => m.redraw())
  }

  refresh () {
    // resetData()
    return Promise.all([
      this.data(),
      this.threads(),
      this.rateUpdates(),
      this.lastOrders()
    ]).then(() => {
      m.redraw()
    })
  }
}

let dczk = null
const maxAllowance = 100000000000000

function changeVersion (e) {
  resetData()
  currentVersion = e.target.value
  dczk = window.dczk = new DCZK(dczk.accounts, e.target.value)
  dczk.init().then(ok => {
    if (ok) {
      dczk.refresh()
    }
    m.redraw()
  })
}

async function loadWeb3 () {
  resetData()
  if (dczk) {
    await dczk.exit()
  }
  console.log('Web3 browser enabled')
  web3.eth.getAccounts((err, acc) => {
    dczk = window.dczk = new DCZK(acc, currentVersion)
    dczk.init().then(ok => {
      if (ok) {
        dczk.refresh()
      }
      m.redraw()
    })
  })
}

function changeAmount (type, amount) {
  return () => {
    const tk = type === 'buy' ? 'DAI' : 'DCZK'
    updateState(type)({ target: { value: amount === 1 ? data.balances[tk] : dczk.calcRateTargetAmount(data.balances[tk], amount) } })
    return false
  }
}

window.addEventListener('load', () => {
  // Modern dapp browsers...
  if (window.ethereum) {
    window.web3 = new Web3(ethereum)
    try {
      // Request account access if needed
      ethereum.autoRefreshOnNetworkChange = false
      ethereum.enable().then(() => {
        loadWeb3()
      })
      ethereum.on('networkChanged', () => {
        loadWeb3()
      })
      ethereum.on('accountsChanged', () => {
        loadWeb3()
      })
      // Acccounts now exposed
    } catch (error) {
      // User denied account access...
    }
  } else if (window.web3) {
    // Legacy dapp browsers...
    window.web3 = new Web3(web3.currentProvider)
    // Acccounts always exposed
    loadWeb3()
  } else {
    // Non-dapp browsers...
    noWeb3 = true
    m.redraw()
  }
})

const Page = {
  view () {
    return [
      m('.container', m({
        view () {
          const msg = { type: null, arr: null }
          if (badNetwork === true) {
            msg.type = 'danger'
            msg.arr = [
              m('b', 'Špatná síť - prosím přepněte na síť Kovan')
            ]
          }
          if (badNetwork === false) {
            msg.type = 'info'
            msg.arr = [
              m('b', 'Vývojová verze - Kovan Ethereum Testnet'),
              m('p', 'Všechny prostředky zde uvedené jsou jen testovací mince na testovací síti Ethereum. Neposílejte nikam reálné DAI nebo ETH mince!'),
              m('p', [
                'Zdrojový kód kontraktu: ',
                m('a', { href: sourceLink, target: '_blank' }, sourceLink)
              ])
            ]
          }
          if (badNetwork === null) {
            msg.arr = [
              m('b', 'Načítám Web3 poskytovatele ..')
            ]
          }
          if (noWeb3 === true) {
            msg.type = 'danger'
            msg.arr = [
              m('b', 'Web3 poskytovatel nenalezen!'),
              m('p', [
                'Ke správnému fungování aplikace je nutné použít Web3 kompatibilní prohlížec a nebo nainstalovat rozšíření ',
                m('a', { href: 'https://metamask.io' }, 'MetaMask'),
                '.'
              ])
            ]
          }
          if (!msg) {
            return null
          }
          return m('.section', { style: 'padding-top: 0;' }, [
            m(`article.message.is-${msg.type || 'is-primary'}`, [
              m('.message-header', msg.arr[0]),
              m('.message-body', msg.arr.slice(1))
            ])
          ])
        }
      })),
      m('.container.dczk-overview', [
        m('.section', { style: 'padding-top: 0; padding-bottom: 0;' }, [
          m('.tile.is-ancestor', [
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', { title: data.totalSupply }, data.totalSupply ? num(data.totalSupply) + ' dCZK' : '..'),
                m('p.subtitle', 'Celková zásoba mincí')
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', { title: data.potSupply }, data.potSupply ? num(data.potSupply) + ' DAI' : '..'),
                m('p.subtitle', 'Celková rezerva')
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', { title: data.totalVolume }, data.totalVolume ? num(data.totalVolume) + ' dCZK' : '..'),
                m('p.subtitle', 'Celkový objem obchodů')
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', { title: data.potDrip }, data.potDrip ? num(data.potDrip, 4) + ' DAI' : '..'),
                m('p.subtitle', 'Nezaúčtovaná likvidita (drip)')
              ])
            ])
          ]),
          m('.tile.is-ancestor', [
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', data.rate ? num(data.rate) + ' dCZK/DAI' : '..'),
                m('p.subtitle', [
                  'Kurz dle orákule',
                  !data.lastUpdate ? '' : m('span', { title: data.lastUpdate }, `, ${dateFns.formatDistance(data.lastUpdate, new Date(), { locale: cs })} zpět`)
                ])
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', { title: data.savingRate }, data.savingRate ? num(data.savingRate) + '% APR' : '..'),
                m('p.subtitle', 'Spořící sazba')
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', data.fee ? (data.fee + '%') : '..'),
                m('p.subtitle', 'Poplatek za vyražení dCZK')
              ])
            ]),
            m('.tile.is-parent', [
              m('.tile.is-child.box', [
                m('p.title', data.feeTreasury ? num(data.feeTreasury) + ' DAI' : '..'),
                m('p.subtitle', 'Truhla poplatků')
              ])
            ])
          ])
        ])
      ]),
      m('.container', [
        m('.section', { style: 'padding-bottom: 0;' }, [
          m('h2.title.is-4', 'Moje mince'),
          m('.box', [
            m('table.table.is-fullwidth.dczk-tokens', [
              m('thead', [
                m('tr', [
                  m('th', { width: 50 }),
                  m('th', { width: 100 }, 'Mince'),
                  m('th', { width: 300 }, 'Zůstatek'),
                  m('th', { align: 'center', width: 130 }, 'Oprávnění'),
                  // m('th', { width: 200, colspan: 2 }, 'Úprava odemknuté částky'),
                  m('th', 'Kontrakt')
                ])
              ]),
              m('tbody', dczk ? Object.keys(tokens).map(tk => {
                const t = tokens[tk]
                const addr = contracts[t.contract].address
                const approved = state[`${t.contract}_approve`]
                return m('tr', [
                  m('td', m(`.dczk-token.token-${tk}`)),
                  m('td', [
                    m('div', t.symbol)
                  ]),
                  m('td', [
                    m('div', !data.balances[tk] ? '..' : [
                      data.balances[tk] !== 0 ? m('b', { title: data.balances[tk] }, num(data.balances[tk], t.dp)) : 0,
                      (tk === 'DAI' && state.buy ? m('small', { style: 'color: red;' }, ` → ${num(Number(data.balances[tk]) - state.buy)}`) : ''),
                      (tk === 'DAI' && state.sell ? m('small', { style: 'color: green;' }, ` → ${num(Number(dczk.sellPrice(state.sell)) + Number(data.balances[tk]))}`) : ''),
                      (tk === 'DCZK' && state.sell ? m('small', { style: 'color: red;' }, ` → ${num(Number(data.balances[tk] - state.sell))}`) : ''),
                      (tk === 'DCZK' && state.buy ? m('small', { style: 'color: green;' }, ` → ${num(Number(dczk.buyPrice(state.buy)) + Number(data.balances[tk]))}`) : '')
                    ])
                  ]),
                  m('td', { align: 'center' }, [
                    m('div', t.approve === false ? '-' : [
                      // (data.allowances[tk] ? m('span', { title: data.allowances[tk] }, num(data.allowances[tk], t.dp)) : '..'),
                      // (approved ? m('small', { style: 'color: green;' }, ` +${approved}`) : '')
                      data.allowances[tk]
                        ? data.allowances[tk] && data.allowances[tk] >= maxAllowance
                          ? m('span', { style: 'cursor: pointer;', onclick: dczk.setAllowance(t.contract, 0), title: 'Uzamknout ' + t.symbol }, fa('fas fa-lock-open'))
                          : [
                            m('span', { style: 'cursor: pointer', onclick: dczk.setAllowance(t.contract), title: 'Odemknout ' + t.symbol }, fa('fas fa-lock'))
                            // m('button.button.is-small.is-primary', { style: 'margin-left: 1.5em;', onclick: dczk.setAllowance(t.contract) }, 'Odemknout')
                          ]
                        : '..'
                    ])
                  ]),
                  /* m('td', [
                    t.approve === false ? '' : m('input.input.is-small', { oninput: updateState(`${t.contract}_approve`), value: approved })
                  ]), */
                  /* m('td', [
                    t.approve === false ? '' : m('button.button.is-small', { onclick: dczk.setAllowance(t.contract), disabled: !approved, class: approved ? 'is-primary' : '' }, 'Upravit')
                  ]), */
                  m('td', [
                    !addr ? '-' : m('a', { href: `https://kovan.etherscan.io/token/${addr}?a=${dczk.user}`, target: '_blank' }, addr)
                  ])
                ])
              }) : '..')
            ])
          ])
        ])
      ]),
      m('.container', [
        m('.section', { style: 'padding-bottom: 0;' }, [
          m('h2.title.is-4', 'Mincovna'),
          data.balances.DAI > 0 ? '' : m('article.message.is-info', [
            m('.message-body', [
              m('b', 'Jak získat testovací Kovan DAI?'),
              m('p', [
                '1. Zažádejte si o Kovan ETH - ',
                m('a', { href: 'https://faucet.kovan.network/', target: '_blank' }, 'Kovan Faucet'),
                ' (nutný GitHub účet) nebo ',
                m('a', { href: '', target: '_blank' }, 'Gitter - kovan-testnet/faucet'),
                ' (nutný GitHub/GitLab/Twitter účet).'
              ]),
              m('p', [
                '2. Když už máte Kovan ETH, tak použijte standartní postup pro generování DAI, tedy - Kovan ETH uzamkněte v MakerDAO kontraktu a vygenerujte si Kovan DAI - ',
                m('a', { href: 'https://mcd-cdp-portal-git-develop.mkr-js-prod.now.sh/borrow?network=kovan', target: '_blank' }, 'MakerDAO Kovan'),
                '.'
              ])
            ])
          ]),
          m('.tile.is-ancestor', (!dczk || !data.balances.DAI) ? '..' : [
            m('.tile.is-parent', [
              m('article.tile.is-child.box', [
                m('.content', [
                  m('.field', [
                    m('.label', [
                      m('.level', [
                        m('.level-left', [
                          m('.level-item', 'Vyrazit mince')
                        ]),
                        data.balances.DAI <= 0 ? '' : m('.level-right.amounts', [
                          m('.level-item', m('a', { onclick: changeAmount('buy', '0.25') }, '25%')),
                          m('.level-item', m('a', { onclick: changeAmount('buy', '0.50') }, '50%')),
                          m('.level-item', m('a', { onclick: changeAmount('buy', '1') }, '100%'))
                        ])
                      ])
                    ]),
                    m('.control.has-text-right', [
                      m('input.input', { placeholder: 'Zadejte počet DAI', oninput: updateState('buy'), value: state.buy }),
                      m('span.text.is-right', 'DAI')
                    ])
                  ]),
                  m('.field', m({
                    view () {
                      if (!dczk) {
                        return ''
                      }
                      const val = state.buy ? dczk.buyPrice(state.buy) : ''
                      const rate = dczk.calcRateTargetAmount(data.rate, dczk.fromWei(dczk.priceWithoutFeeBN('1')))
                      return [
                        m('.control.has-text-right', [
                          m('input.input', { disabled: true, placeholder: 'Počet vyražených dCZK', value: val === -2 ? 'Špatné číslo (příliš mnoho desetinných míst?)' : val }),
                          m('span.text.is-right', 'dCZK')
                        ]),
                        state.buy ? m('p.help', [
                          'Kurz: ',
                          m('b', { title: rate }, num(rate, 4)),
                          ' dCZK/DAI, včetně poplatku: 0.25%'
                        ]) : ''
                      ]
                    }
                  })),
                  m('.field.is-grouped', [
                    (data.allowances.DAI && data.allowances.DAI < maxAllowance) ? m('p.control', [
                      m('button.button.is-primary', { onclick: dczk.setAllowance('DAI') }, [
                        m('span.icon', fa('fas fa-unlock')),
                        m('span', 'Odemknout DAI')
                      ])
                    ]) : m('p.control', [
                      m('button.button', { disabled: !(state.buy && data.balances.DAI >= Number(state.buy)), class: state.buy ? (data.balances.DAI >= Number(state.buy) ? 'is-primary' : 'is-danger') : '', onclick: dczk.buy() }, 'Vyrazit dCZK')
                    ])
                  ])
                ])
              ])
            ]),
            m('.tile.is-parent', [
              m('article.tile.is-child.box', [
                m('.content', [
                  m('.field', [
                    m('.label', [
                      m('.level', [
                        m('.level-left', [
                          m('.level-item', 'Spálit mince')
                        ]),
                        data.balances.DCZK <= 0 ? '' : m('.level-right.amounts', [
                          m('.level-item', m('a', { onclick: changeAmount('sell', '0.25') }, '25%')),
                          m('.level-item', m('a', { onclick: changeAmount('sell', '0.50') }, '50%')),
                          m('.level-item', m('a', { onclick: changeAmount('sell', '1') }, '100%'))
                        ])
                      ])
                    ]),
                    m('.control.has-text-right', [
                      m('input.input', { placeholder: 'Zadejte počet dCZK', oninput: updateState('sell'), value: state.sell }),
                      m('span.text.is-right', 'dCZK')
                    ])
                  ]),
                  m('.field', m({
                    view () {
                      const val = state.sell ? dczk.sellPrice(state.sell) : ''
                      const rate = val > 0 ? dczk.calcRate(val, state.sell) : null
                      return [
                        m('.control.has-text-right', [
                          m('input.input', { disabled: true, placeholder: 'Počet vrácených DAI', value: val === -2 ? 'Špatné číslo (příliš mnoho desetinných míst?)' : (val === -1 ? 'Nedostatek likvidity' : val) }),
                          m('span.text.is-right', 'DAI')
                        ]),
                        rate ? m('p.help', [
                          'Kurz: ',
                          m('b', { title: rate }, num(rate, 4)),
                          ' dCZK/DAI, poplatek: 0%'
                        ]) : ''
                      ]
                    }
                  })),
                  m('.field.is-grouped', [
                    (data.allowances.DCZK && data.allowances.DCZK < maxAllowance) ? m('p.control', [
                      m('button.button.is-primary', { onclick: dczk.setAllowance('DCZK') }, [
                        m('span.icon', fa('fas fa-unlock')),
                        m('span', 'Odemknout dCZK')
                      ])
                    ]) : m('.control', [
                      m('button.button', { disabled: !(state.sell && data.balances.DCZK >= Number(state.sell)), class: state.sell ? (data.balances.DCZK >= Number(state.sell) ? 'is-primary' : 'is-danger') : '', onclick: dczk.sell() }, 'Spálit dCZK')
                    ])
                  ])
                ])
              ])
            ])
          ])
        ])
      ]),
      m('.container', [
        m('.section', { style: 'padding-bottom: 0;' }, [
          m('h2.title.is-4', 'Amortizační kniha'),
          m('.box', m({
            view () {
              if (!dczk || !data.rates || data.rates.length === 0) {
                return ''
              }
              const rts = dczk.updatedRates(data.rates, state.buy, state.sell)
              // const rts = data.rates
              return [
                m('table.table.is-fullwidth.rates', [
                  m('thead', [
                    m('tr', [
                      m('th', { width: 100 }, 'Cena'),
                      m('th', 'DAI'),
                      m('th', 'dCZK')
                    ])
                  ]),
                  m('tbody', [
                    rts.map(rt => {
                      return m('tr', { class: rt.subtracted ? 'rate-subtracted' : (rt.removed ? 'rate-removed' : (rt.added ? 'rate-added' : (rt.created ? 'rate-created' : ''))) }, [
                        m('td', [
                          m('div', rt.rate)
                        ]),
                        m('td', [
                          m('div', { title: rt.amount }, [
                            rt.amount,
                            rt.added ? m('small', ' → ' + dczk.add(rt.amount, rt.added)) : '',
                            rt.subtracted ? m('small', ' → ' + dczk.sub(rt.amount, rt.subtracted)) : ''
                          ])
                        ]),
                        m('td', [
                          m('div', [
                            dczk.calcRateTargetAmount(rt.rate, rt.amount),
                            rt.added ? m('small', ' → ' + dczk.add(dczk.calcRateTargetAmount(rt.rate, rt.amount), dczk.calcRateTargetAmount(rt.rate, rt.added))) : '',
                            rt.subtracted ? m('small', ' → ' + dczk.sub(dczk.calcRateTargetAmount(rt.rate, rt.amount), dczk.calcRateTargetAmount(rt.rate, rt.subtracted))) : ''
                          ])
                        ])
                      ])
                    }),
                    m({
                      view () {
                        if (!dczk) { return '..' }
                        const liq = dczk.totalLiquidity()
                        return m('tr', [
                          m('th', m('div', { title: liq.rate }, num(liq.rate, 2))),
                          m('th', m('div', { title: liq.dai }, liq.dai + ' DAI')),
                          m('th', m('div', { title: liq.dczk }, liq.dczk + ' dCZK'))
                        ])
                      }
                    })
                  ])
                ])
              ]
            }
          }))
        ])
      ]),
      m('.container', [
        m('.section', { style: 'padding-bottom: 0;' }, [
          m('h2.title.is-4', 'Objednávky (posledních 10)'),
          m('.box', [
            m('table.table.is-fullwidth', [
              m('thead', [
                m('tr', [
                  m('th', { width: 200 }, 'Čas'),
                  m('th', 'Typ'),
                  m('th', 'DAI'),
                  m('th', 'dCZK'),
                  m('th', 'Kurz'),
                  m('th', 'Transakce')
                ])
              ]),
              m('tbody', [
                data.orders.slice(0, 10).map(order => {
                  return m('tr', [
                    m('td', [
                      m('div', { title: order.time.toISOString() }, dateFns.format(order.time, 'd.M.yyyy HH:mm:ss'))
                    ]),
                    m('td', [
                      m('div', order.type === 'buy' ? m('span', { style: 'color:green;' }, 'nákup') : m('span', { style: 'color:red;' }, 'prodej'))
                    ]),
                    m('td', [
                      m('div', { title: order.dai }, num(order.dai, 4))
                    ]),
                    m('td', [
                      m('div', { title: order.dczk }, num(order.dczk, 4))
                    ]),
                    m('td', [
                      m('div', { title: order.dczk / order.dai }, num(order.dczk / order.dai))
                    ]),
                    m('td', [
                      m('a', { href: `https://kovan.etherscan.io/tx/${order.txid}`, target: '_blank' }, order.txid)
                    ])
                  ])
                })
              ])
            ])
          ])
        ])
      ]),
      m('.container', [
        m('.section', { style: 'padding-bottom: 0;' }, [
          m('h2.title.is-4', 'Aktualizace kurzu (posledních 10)'),
          m('.box', [
            m('table.table.is-fullwidth', [
              m('thead', [
                m('tr', [
                  m('th', { width: 200 }, 'Čas'),
                  m('th', 'dCZK/DAI'),
                  m('th', 'Transakce')
                ])
              ]),
              m('tbody', [
                data.updates.slice(0, 10).map(update => {
                  return m('tr', [
                    m('td', [
                      m('div', { title: update.time.toISOString() }, dateFns.format(update.time, 'd.M.yyyy HH:mm:ss'))
                    ]),
                    m('td', [
                      m('div', { title: update.rate }, num(update.rate))
                    ]),
                    m('td', [
                      m('a', { href: `https://kovan.etherscan.io/tx/${update.txid}`, target: '_blank' }, update.txid)
                    ])
                  ])
                })
              ])
            ])
          ])
        ])
      ]),
      m('.container', { style: 'padding-top: 1em;' }, [
        m('button.button', { onclick: () => dczk.refresh() }, 'Obnovit')
      ])
    ]
  }
}

const Layout = {
  view () {
    return m('div', [
      m('section.hero', [
        m('.hero-body', [
          m('.container', [
            m('.level', [
              m('.level-left', [
                m('.level-item', [
                  m('.logo'),
                  m('h1.title', 'dCZK DEX | Decentralizovaná Koruna')
                ])
              ]),
              m('.level-right', [
                m('.level-item', [
                  m('.select', [
                    m('select', { onchange: changeVersion, value: currentVersion }, Object.keys(versions).map(v => {
                      const d = versions[v]
                      return m('option', { value: v }, `Testnet [${d.net}] v${v}`)
                    }))
                  ])
                ])
              ])
            ]),
            m(Page)
          ])
        ])
      ])
    ])
  }
}

m.route(document.getElementById('dczk-dapp'), '/', {
  '/': { render: vnode => m(Layout) }
})

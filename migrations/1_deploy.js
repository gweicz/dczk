/* globals artifacts */
const DCZK = artifacts.require('DCZK')
const Oracle = artifacts.require('Oracle')

module.exports = async function (deployer) {
  await deployer.deploy(Oracle)
  await deployer.deploy(DCZK, Oracle.address)
}
